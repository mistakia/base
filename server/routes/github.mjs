import express from 'express'
import debug from 'debug'

import config from '#config'
import { github, github_tasks } from '#libs-server'

const router = express.Router()
const log = debug('api:github')
debug.enable('api:github,github-tasks')

// Create a raw body parser middleware for GitHub webhook signature verification
const rawBodyParser = (req, res, next) => {
  req.body_buffer = Buffer.from([])

  req.on('data', (chunk) => {
    req.body_buffer = Buffer.concat([req.body_buffer, chunk])
  })

  req.on('end', () => {
    // Store the raw body
    req.raw_body = req.body_buffer

    // Parse as JSON if possible
    try {
      req.body = JSON.parse(req.body_buffer.toString('utf8'))
    } catch (e) {
      req.body = {}
    }

    next()
  })
}

// Add raw body parser middleware
router.use(rawBodyParser)

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
      const is_valid = github_tasks.verify_github_signature(req, webhook_secret)

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

        // Convert the repository data to the format expected by the library
        const repo_info = {
          owner: repository.owner.login,
          repo: repository.name,
          github_token
        }

        // Process the issue
        const result =
          await github_tasks.create_or_update_task_from_github_issue({
            issue,
            repo_info,
            user_id: default_user_id,
            force_update: true
          })

        log(
          `Issue processed: ${repository.full_name}#${issue.number} - Action: ${result.action}`
        )

        return res.json({
          ok: true,
          message: `Issue ${issue.number} processed`,
          action: result.action,
          entity_id: result.entity_id ? result.entity_id.toString('hex') : null
        })
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

          // Process the issue with project card data
          const result =
            await github_tasks.create_or_update_task_from_github_issue({
              issue,
              repo_info: { owner, repo, github_token },
              user_id: default_user_id,
              force_update: true,
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
              : null
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
