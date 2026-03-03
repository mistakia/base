import express from 'express'
import debug from 'debug'
import crypto from 'crypto'
import path from 'path'

import config from '#config'
import { github } from '#libs-server'
import {
  add_files,
  commit_changes
} from '#libs-server/git/commit-operations.mjs'

const router = express.Router()
const log = debug('api:github')

// Verify GitHub webhook signature
const verify_github_signature = (req, secret) => {
  const signature = req.headers['x-hub-signature-256']

  if (!signature) {
    log('No signature header found')
    return false
  }

  if (!secret) {
    log('No webhook secret provided')
    return false
  }

  try {
    const hmac = crypto.createHmac('sha256', secret)
    const digest = 'sha256=' + hmac.update(req.raw_body).digest('hex')

    const result = crypto.timingSafeEqual(
      Buffer.from(digest),
      Buffer.from(signature)
    )

    if (!result) {
      log('Signature verification failed')
    }

    return result
  } catch (error) {
    log(`Error verifying signature: ${error.message}`)
    return false
  }
}

// Auto-commit a webhook-created or updated task file
const auto_commit_task_file = async ({
  absolute_path,
  action,
  issue_number,
  repository_full_name
}) => {
  const user_base_directory = config.user_base_directory
  if (!user_base_directory || !absolute_path) {
    log('Skipping auto-commit: missing user_base_directory or absolute_path')
    return
  }

  try {
    const relative_path = path.relative(user_base_directory, absolute_path)
    await add_files({
      worktree_path: user_base_directory,
      files_to_add: [relative_path]
    })
    await commit_changes({
      worktree_path: user_base_directory,
      commit_message: `chore: github webhook ${action} task for ${repository_full_name}#${issue_number}`
    })
    log(`Auto-committed ${action} task: ${relative_path}`)
  } catch (error) {
    log(`Auto-commit failed (non-fatal): ${error.message}`)
  }
}

// GitHub webhook endpoint
router.post('/webhooks', async (req, res) => {
  try {
    log(
      `Received webhook: ${req.headers['x-github-event']} - ${req.headers['x-github-delivery']}`
    )

    // Verify GitHub webhook signature - MANDATORY
    const webhook_secret = config.github?.webhook_secret
    if (!webhook_secret) {
      log(
        'ERROR: GitHub webhook secret not configured. Set github.webhook_secret in config.'
      )
      return res.status(500).json({
        error: 'Server Configuration Error',
        message: 'Webhook signature verification is not configured'
      })
    }

    const is_valid = verify_github_signature(req, webhook_secret)
    if (!is_valid) {
      log('Invalid webhook signature')
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid webhook signature'
      })
    }

    // Get the event name and process accordingly
    const event_name = req.headers['x-github-event']
    const github_token = config.github_access_token
    const default_user_public_key = config.user_public_key

    // Process different event types
    switch (event_name) {
      case 'ping':
        log('Received ping event')
        return res.status(200).send('pong')

      case 'issues': {
        // Handle issue events (created, edited, etc.)
        const action = req.body.action
        const issue = req.body.issue
        const repository = req.body.repository

        if (!issue || !repository) {
          log('Invalid issues event payload - missing issue or repository data')
          return res.status(400).json({
            error: 'Bad Request',
            message: 'Invalid issues event payload'
          })
        }

        log(
          `Processing issue event: ${action} for ${repository.full_name}#${issue.number}`
        )

        // Process the issue using the new sync system
        const result = await github.process_single_github_issue({
          issue,
          github_repository_owner: repository.owner.login,
          github_repository_name: repository.name,
          user_public_key: default_user_public_key
        })

        log(
          `Issue processed: ${repository.full_name}#${issue.number} - Action: ${result.action}`
        )

        if (result.action === 'created' || result.action === 'updated') {
          await auto_commit_task_file({
            absolute_path: result.absolute_path,
            action: result.action,
            issue_number: issue.number,
            repository_full_name: repository.full_name
          })
        }

        return res.json({
          ok: true,
          message: `Issue ${issue.number} processed`,
          action: result.action,
          entity_id: result.entity_id ? result.entity_id.toString('hex') : null,
          conflicts_found: result.conflicts_found || false
        })
      }

      case 'pull_request': {
        log(`PR webhook: ${req.body.action} event acknowledged (no handler)`)
        return res.json({ ok: true })
      }

      case 'project_card': {
        // Handle project card events - e.g. when an issue is added to a project
        // const action = req.body.action
        const card = req.body.project_card

        // Only process cards with content (issues)
        if (!card || !card.content_url) {
          log('Project card without content, skipping')
          return res.json({
            ok: true,
            message: 'Project card without issue content, skipping'
          })
        }

        // Extract issue details from content_url
        // Format: https://api.github.com/repos/owner/repo/issues/number
        const issue_url_match = card.content_url.match(
          /github\.com\/repos\/([^/]+)\/([^/]+)\/issues\/(\d+)/
        )

        if (!issue_url_match) {
          log(`Invalid content URL format: ${card.content_url}`)
          return res.status(400).json({
            error: 'Bad Request',
            message: 'Invalid issue URL format'
          })
        }

        const [
          ,
          github_repository_owner,
          github_repository_name,
          issue_number
        ] = issue_url_match

        log(
          `Processing project card event for ${github_repository_owner}/${github_repository_name}#${issue_number}`
        )

        // Fetch the issue
        try {
          const issue = await github.get_github_issue({
            github_repository_owner,
            github_repository_name,
            issue_number: parseInt(issue_number, 10),
            github_token
          })

          // Process the issue with project card data using the new sync system
          const result = await github.process_single_github_issue({
            issue,
            github_repository_owner,
            github_repository_name,
            user_public_key: default_user_public_key,
            project_item: card
          })

          log(
            `Project card processed: ${github_repository_owner}/${github_repository_name}#${issue_number} - Action: ${result.action}`
          )

          if (result.action === 'created' || result.action === 'updated') {
            await auto_commit_task_file({
              absolute_path: result.absolute_path,
              action: result.action,
              issue_number,
              repository_full_name: `${github_repository_owner}/${github_repository_name}`
            })
          }

          return res.json({
            ok: true,
            message: `Project card for issue ${issue_number} processed`,
            action: result.action,
            entity_id: result.entity_id
              ? result.entity_id.toString('hex')
              : null,
            conflicts_found: result.conflicts_found || false
          })
        } catch (error) {
          log(`Error fetching issue for project card: ${error.message}`)
          return res.status(500).json({
            error: 'Internal Server Error',
            message: `Error fetching issue: ${error.message}`
          })
        }
      }

      default:
        // Return OK but indicate event was ignored
        log(`Ignoring unsupported event type: ${event_name}`)
        return res.json({
          ok: true,
          message: `Event type '${event_name}' not processed`
        })
    }
  } catch (error) {
    log(`Error processing webhook: ${error.message}`)
    log(error.stack)

    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    })
  }
})

export default router
