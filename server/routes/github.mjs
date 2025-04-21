import express from 'express'
import debug from 'debug'
import crypto from 'crypto'

import config from '#config'
import { github } from '#libs-server'
import {
  handle_pr_merged,
  handle_pr_closed_without_merging,
  handle_pr_reopened
} from '#libs-server/change_requests/webhooks.mjs'

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

// GitHub webhook endpoint
router.post('/webhooks', async (req, res) => {
  try {
    log(
      `Received webhook: ${req.headers['x-github-event']} - ${req.headers['x-github-delivery']}`
    )

    // Check authorization if token is set
    const webhook_token = config.github?.webhook_token
    if (webhook_token) {
      const auth_header = req.headers.authorization
      const expected = `Bearer ${webhook_token}`

      if (!auth_header || auth_header !== expected) {
        log('Invalid or missing authorization token')
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid or missing authorization token'
        })
      }
    }

    // Verify GitHub signature if enabled
    const webhook_secret = config.github?.webhook_secret
    if (webhook_secret) {
      const is_valid = verify_github_signature(req, webhook_secret)

      if (!is_valid) {
        log('Invalid webhook signature')
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid webhook signature'
        })
      }
    }

    // Get the event name and process accordingly
    const event_name = req.headers['x-github-event']
    const github_token = config.github?.access_token
    const default_user_id = config.github?.default_user_id

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
          repo_owner: repository.owner.login,
          repo_name: repository.name,
          github_token,
          user_id: default_user_id
        })

        log(
          `Issue processed: ${repository.full_name}#${issue.number} - Action: ${result.action}`
        )

        return res.json({
          ok: true,
          message: `Issue ${issue.number} processed`,
          action: result.action,
          entity_id: result.entity_id ? result.entity_id.toString('hex') : null,
          conflicts_found: result.conflicts_found || false
        })
      }

      case 'pull_request': {
        // Handle pull request events (merged, closed, reopened)
        const action = req.body.action
        const pull_request = req.body.pull_request
        const repository = req.body.repository
        const number = req.body.number
        const sender = req.body.sender
        let result = null

        // Validate required fields according to schema
        if (!action || !pull_request || !repository || !number || !sender) {
          const missing_fields = []
          if (!action) missing_fields.push('action')
          if (!pull_request) missing_fields.push('pull_request')
          if (!repository) missing_fields.push('repository')
          if (!number) missing_fields.push('number')
          if (!sender) missing_fields.push('sender')

          log(
            `Invalid pull_request event payload - missing required fields: ${missing_fields.join(', ')}`
          )
          return res.status(400).json({
            error: 'Bad Request',
            message: `Invalid pull_request event payload - missing required fields: ${missing_fields.join(', ')}`
          })
        }

        // Validate repository object has required fields
        const required_repo_fields = ['id', 'full_name', 'owner']
        const missing_repo_fields = required_repo_fields.filter(
          (field) => !repository[field]
        )
        if (missing_repo_fields.length > 0) {
          log(
            `Invalid repository object - missing required fields: ${missing_repo_fields.join(', ')}`
          )
          return res.status(400).json({
            error: 'Bad Request',
            message: `Invalid repository object - missing required fields: ${missing_repo_fields.join(', ')}`
          })
        }

        // Validate repository owner has required fields
        if (!repository.owner.id || !repository.owner.login) {
          log(
            'Invalid repository owner object - missing required fields: id and/or login'
          )
          return res.status(400).json({
            error: 'Bad Request',
            message:
              'Invalid repository owner object - missing required fields: id and/or login'
          })
        }

        log(
          `Processing pull request event: ${action} for ${repository.full_name}#${number}`
        )

        try {
          // Call appropriate handler based on the action
          if (action === 'closed' && pull_request.merged) {
            // PR was merged
            result = await handle_pr_merged(req.body)
          } else if (action === 'closed' && !pull_request.merged) {
            // PR was closed without merging
            result = await handle_pr_closed_without_merging(req.body)
          } else if (action === 'reopened') {
            // PR was reopened
            result = await handle_pr_reopened(req.body)
          }

          if (result) {
            log(
              `PR webhook processed: ${repository.full_name}#${number} - Status updated to ${result.status}`
            )
            return res.json({
              ok: true,
              message: `Pull request ${number} processed`,
              change_request_id: result.change_request_id,
              status: result.status
            })
          } else {
            log(
              `PR webhook: ${repository.full_name}#${number} - No action taken for ${action}`
            )
            return res.json({
              ok: true,
              message: `Pull request event '${action}' acknowledged but no action taken`
            })
          }
        } catch (error) {
          // Log the error but return a 200 status
          log(`Error processing webhook: ${error.message}`)
          return res.status(200).json({
            ok: false,
            error: 'Error processing webhook',
            message: error.message
          })
        }
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

        const [, owner, repo, issue_number] = issue_url_match
        log(
          `Processing project card event for ${owner}/${repo}#${issue_number}`
        )

        // Fetch the issue
        try {
          const issue = await github.get_github_issue({
            owner,
            repo,
            issue_number: parseInt(issue_number, 10),
            github_token
          })

          // Process the issue with project card data using the new sync system
          const result = await github.process_single_github_issue({
            issue,
            repo_owner: owner,
            repo_name: repo,
            github_token,
            user_id: default_user_id,
            project_item: card
          })

          log(
            `Project card processed: ${owner}/${repo}#${issue_number} - Action: ${result.action}`
          )

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
