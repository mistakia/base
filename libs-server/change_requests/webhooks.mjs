import debug from 'debug'
import db from '#db'
import {
  read_markdown_entity,
  write_markdown_entity
} from '#libs-server/markdown/index.mjs'
import { CHANGE_REQUEST_DIR } from './constants.mjs'
import { get_change_request } from './retrieve.mjs'
import { update_change_request_status } from './update.mjs'

const log = debug('change-requests')

/**
 * Validate the base webhook payload structure according to schema
 *
 * @param {Object} webhook_payload - The GitHub webhook payload
 * @returns {string|null} Error message if invalid, null if valid
 */
function validate_base_payload(webhook_payload) {
  if (!webhook_payload) return 'Missing webhook payload'

  const required_fields = [
    'action',
    'number',
    'pull_request',
    'repository',
    'sender'
  ]
  const missing_fields = required_fields.filter(
    (field) => !webhook_payload[field]
  )

  if (missing_fields.length > 0) {
    return `Missing required fields: ${missing_fields.join(', ')}`
  }

  // Validate repository
  const repo = webhook_payload.repository
  const required_repo_fields = ['id', 'full_name', 'owner']
  const missing_repo_fields = required_repo_fields.filter(
    (field) => !repo[field]
  )

  if (missing_repo_fields.length > 0) {
    return `Missing required repository fields: ${missing_repo_fields.join(', ')}`
  }

  // Validate repository owner
  if (!repo.owner.id || !repo.owner.login) {
    return 'Missing required repository owner fields: id and/or login'
  }

  return null
}

/**
 * Handle GitHub pull request merged webhook event
 * Update the change request status to 'Merged' when the corresponding PR is merged on GitHub
 *
 * @param {Object} webhook_payload - The GitHub webhook payload
 * @returns {Promise<Object|null>} The updated change request or null if no matching CR found
 */
export async function handle_pr_merged(webhook_payload) {
  try {
    const validation_error = validate_base_payload(webhook_payload)
    if (validation_error) {
      log(`Invalid webhook payload: ${validation_error}`)
      return null
    }

    if (!webhook_payload.pull_request.merged) {
      log('Pull request is not merged')
      return null
    }

    const pr_number = webhook_payload.number
    const github_repo = webhook_payload.repository.full_name

    log(`Processing merged PR #${pr_number} from ${github_repo}`)

    // Find the corresponding change request
    const change_request = await db('change_requests')
      .where({ github_pr_number: pr_number, github_repo })
      .first()

    if (!change_request) {
      log(
        `No matching change request found for PR #${pr_number} in ${github_repo}`
      )
      return null
    }

    // Update the change request status to Merged
    const now = new Date()
    const updated_cr = await db('change_requests')
      .where({ change_request_id: change_request.change_request_id })
      .update({
        status: 'Merged',
        merged_at: now,
        updated_at: now
      })
      .returning('*')

    log(
      `Updated change request ${change_request.change_request_id} status to Merged`
    )
    return updated_cr[0]
  } catch (error) {
    log(`Error handling PR merged webhook: ${error.message}`)
    throw error
  }
}

/**
 * Handle GitHub pull request closed without merging webhook event
 * Update the change request status to 'Closed' when the corresponding PR is closed without merging
 *
 * @param {Object} webhook_payload - The GitHub webhook payload
 * @returns {Promise<Object|null>} The updated change request or null if no matching CR found
 */
export async function handle_pr_closed_without_merging(webhook_payload) {
  try {
    const validation_error = validate_base_payload(webhook_payload)
    if (validation_error) {
      log(`Invalid webhook payload: ${validation_error}`)
      return null
    }

    if (webhook_payload.pull_request.merged) {
      log('Pull request was merged, not handling as closed without merging')
      return null
    }

    const pr_number = webhook_payload.number
    const github_repo = webhook_payload.repository.full_name

    log(`Processing closed PR #${pr_number} from ${github_repo}`)

    // Find the corresponding change request
    const change_request = await db('change_requests')
      .where({ github_pr_number: pr_number, github_repo })
      .first()

    if (!change_request) {
      log(
        `No matching change request found for PR #${pr_number} in ${github_repo}`
      )
      return null
    }

    // Update the change request status to Closed
    const now = new Date()
    const updated_cr = await db('change_requests')
      .where({ change_request_id: change_request.change_request_id })
      .update({
        status: 'Closed',
        closed_at: now,
        updated_at: now
      })
      .returning('*')

    log(
      `Updated change request ${change_request.change_request_id} status to Closed`
    )
    return updated_cr[0]
  } catch (error) {
    log(`Error handling PR closed webhook: ${error.message}`)
    throw error
  }
}

/**
 * Handle GitHub pull request reopened webhook event
 * Update the change request status to 'PendingReview' when the corresponding PR is reopened
 *
 * @param {Object} webhook_payload - The GitHub webhook payload
 * @returns {Promise<Object|null>} The updated change request or null if no matching CR found
 */
export async function handle_pr_reopened(webhook_payload) {
  try {
    const validation_error = validate_base_payload(webhook_payload)
    if (validation_error) {
      log(`Invalid webhook payload: ${validation_error}`)
      return null
    }

    const pr_number = webhook_payload.number
    const github_repo = webhook_payload.repository.full_name

    log(`Processing reopened PR #${pr_number} from ${github_repo}`)

    // Find the corresponding change request
    const change_request = await db('change_requests')
      .where({ github_pr_number: pr_number, github_repo })
      .first()

    if (!change_request) {
      log(
        `No matching change request found for PR #${pr_number} in ${github_repo}`
      )
      return null
    }

    // Update the change request status to PendingReview
    const now = new Date()
    const updated_cr = await db('change_requests')
      .where({ change_request_id: change_request.change_request_id })
      .update({
        status: 'PendingReview',
        closed_at: null, // Clear the closed date since it's reopened
        updated_at: now
      })
      .returning('*')

    log(
      `Updated change request ${change_request.change_request_id} status to PendingReview`
    )
    return updated_cr[0]
  } catch (error) {
    log(`Error handling PR reopened webhook: ${error.message}`)
    throw error
  }
}

/**
 * Handles GitHub webhook events to sync status changes from GitHub PRs to the internal system.
 *
 * @param {object} params - Parameters for handling the webhook.
 * @param {object} params.payload - The GitHub webhook payload.
 * @returns {Promise<object|null>} The updated change request object, or null if no action was taken.
 */
export async function handle_github_webhook({ payload }) {
  if (!payload || !payload.action || !payload.pull_request) {
    log('Invalid GitHub webhook payload')
    return null
  }

  const { action, pull_request, repository } = payload
  const pr_number = pull_request.number
  const github_repo = repository
    ? `${repository.owner.login}/${repository.name}`
    : null

  log(`Processing GitHub webhook: ${action} on PR #${pr_number}`)

  // Find the corresponding change request
  const change_request = await find_matching_change_request(
    pr_number,
    github_repo
  )
  if (!change_request) {
    return null
  }

  const { change_request_id } = change_request

  // Map GitHub events to change request status updates
  const { new_status, comment } = determine_status_update(
    action,
    pr_number,
    pull_request.merged
  )
  if (!new_status) {
    return null
  }

  try {
    // Update the change request status
    const updated_cr = await update_change_request_status({
      change_request_id,
      status: new_status,
      updater_id: 'system:github',
      comment
    })
    return updated_cr
  } catch (error) {
    // Handle special case for PRs merged externally
    if (new_status === 'Merged' && pull_request.merged) {
      return await force_merge_status(change_request_id, pr_number, comment)
    }

    // For other transitions that fail, just log and return null
    log(`Error updating status for webhook: ${error.message}`)
    return null
  }
}

// Helper function to find the matching change request for a GitHub PR
async function find_matching_change_request(pr_number, github_repo) {
  const change_requests = await db('change_requests')
    .where({ github_pr_number: pr_number })
    .andWhere({ github_repo })
    .limit(1)

  if (change_requests.length === 0) {
    log(
      `No matching change request found for PR #${pr_number} in ${github_repo}`
    )
    return null
  }

  return change_requests[0]
}

// Helper function to determine the appropriate status update based on GitHub action
function determine_status_update(action, pr_number, pr_merged) {
  let new_status = null
  let comment = null

  switch (action) {
    case 'closed':
      if (pr_merged) {
        new_status = 'Merged'
        comment = `GitHub PR #${pr_number} was merged on GitHub.`
      } else {
        new_status = 'Closed'
        comment = `GitHub PR #${pr_number} was closed without merging.`
      }
      break
    case 'reopened':
      new_status = 'PendingReview'
      comment = `GitHub PR #${pr_number} was reopened.`
      break
    // Add more cases as needed for other GitHub events
    default:
      log(`No status update needed for action: ${action}`)
  }

  return { new_status, comment }
}

// Helper function to force merge status for PRs merged externally
async function force_merge_status(change_request_id, pr_number, comment) {
  log(
    `Forcing status update to Merged for PR ${pr_number} that was merged on GitHub`
  )

  const now = new Date()

  // Update directly in the database to bypass transition validation
  await db.transaction(async (trx) => {
    // Update the database record
    await trx('change_requests').where({ change_request_id }).update({
      status: 'Merged',
      updated_at: now,
      merged_at: now
    })

    // Update the markdown file too
    try {
      const file_path = `${CHANGE_REQUEST_DIR}/${change_request_id}.md`
      const markdown_data = await read_markdown_entity(file_path)

      // Update frontmatter
      markdown_data.frontmatter.status = 'Merged'
      markdown_data.frontmatter.updated_at = now.toISOString()
      markdown_data.frontmatter.merged_at = now.toISOString()

      // Add comment about forced merge
      let content = markdown_data.content || ''
      const force_comment = `${comment}\n\n(Status forced due to external merge on GitHub)`
      const comment_block = `\n\n## Status Update: Merged\n\n${force_comment}\n\n_Updated by system:github on ${now.toISOString()}_`
      content += comment_block

      // Write back to file
      await write_markdown_entity(file_path, markdown_data.frontmatter, content)
    } catch (markdown_error) {
      log(`Warning: Could not update markdown file: ${markdown_error.message}`)
      // Continue even if markdown update fails
    }
  })

  // Return the updated change request
  try {
    const updated_cr = await get_change_request({ change_request_id })
    if (!updated_cr) {
      log(
        `Warning: Change request ${change_request_id} not found after forced merge update`
      )
      return null
    }
    return updated_cr
  } catch (error) {
    log(
      `Error retrieving updated change request after forced merge: ${error.message}`
    )
    return null
  }
}
