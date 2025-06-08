import debug from 'debug'
import db from '#db'
import { get_change_request } from './retrieve.mjs'
import { update_change_request_status } from './update.mjs'
import { update_markdown_file } from './utils.mjs'

const log = debug('change-requests:webhooks')

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
  let change_request_id
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

    change_request_id = change_request.change_request_id

    if (!change_request) {
      log(
        `No matching change request found for PR #${pr_number} in ${github_repo}`
      )
      return null
    }

    const updated_cr = await update_change_request_status({
      change_request_id,
      status: 'Merged',
      updater_id: 'system:github',
      comment: `GitHub PR #${pr_number} was merged.`
    })

    log(
      `Updated change request ${change_request.change_request_id} status to Merged`
    )
    return updated_cr
  } catch (error) {
    log(`Error handling PR merged webhook: ${error.message}`)

    // Handle special case for PRs merged externally
    try {
      log(`Attempting to force merge status for PR #${webhook_payload.number}`)
      const result = await force_merge_status(
        change_request_id,
        webhook_payload.number,
        `GitHub PR #${webhook_payload.number} was merged.`
      )
      return result
    } catch (force_error) {
      log(`Error forcing merge status: ${force_error.message}`)
      throw error
    }
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
    const updated_cr = await update_change_request_status({
      change_request_id: change_request.change_request_id,
      status: 'Closed',
      updater_id: 'system:github',
      comment: `GitHub PR #${pr_number} was closed without merging.`
    })

    log(
      `Updated change request ${change_request.change_request_id} status to Closed`
    )
    return updated_cr
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
    const updated_cr = await update_change_request_status({
      change_request_id: change_request.change_request_id,
      status: 'PendingReview',
      updater_id: 'system:github',
      comment: `GitHub PR #${pr_number} was reopened.`
    })

    log(
      `Updated change request ${change_request.change_request_id} status to PendingReview`
    )
    return updated_cr
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

  // Dispatch to appropriate handler based on action
  if (action === 'closed' && pull_request.merged) {
    return await handle_pr_merged(payload)
  } else if (action === 'closed' && !pull_request.merged) {
    return await handle_pr_closed_without_merging(payload)
  } else if (action === 'reopened') {
    return await handle_pr_reopened(payload)
  }

  // If no specific handler, use the generic approach
  const change_request = await find_matching_change_request(
    pr_number,
    github_repo
  )
  if (!change_request) {
    log(
      `No matching change request found for PR #${pr_number} in ${github_repo}`
    )
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
    log(
      `No status update determined for webhook: ${action} on PR #${pr_number}`
    )
    return null
  }

  // Special case for comments - return the change request without updating status
  if (new_status === 'comment') {
    log(`Received comment on PR #${pr_number}, not changing status`)
    return await get_change_request({
      change_request_id
    })
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

// Helper function to find the matching change request for a PR
async function find_matching_change_request(pr_number, github_repo) {
  if (!pr_number || !github_repo) {
    log('Missing PR number or GitHub repo')
    return null
  }

  try {
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

    return change_request
  } catch (error) {
    log(`Error finding matching change request: ${error.message}`)
    return null
  }
}

// Helper function to determine status update from webhook action
function determine_status_update(action, pr_number, is_merged) {
  let new_status = null
  let comment = ''

  if (action === 'closed' && is_merged) {
    // PR was merged
    new_status = 'Merged'
    comment = `GitHub PR #${pr_number} was merged.`
  } else if (action === 'closed' && !is_merged) {
    // PR was closed without merging
    new_status = 'Closed'
    comment = `GitHub PR #${pr_number} was closed without merging.`
  } else if (action === 'reopened') {
    // PR was reopened
    new_status = 'PendingReview'
    comment = `GitHub PR #${pr_number} was reopened for review.`
  } else if (
    action === 'created' ||
    action === 'edited' ||
    action === 'submitted'
  ) {
    // PR comment or review event
    // For comments, we don't change the status, just return 'comment' as status
    // to indicate we found the PR but aren't changing its status
    new_status = 'comment'
    comment = `A comment was added to GitHub PR #${pr_number}.`
  }

  return { new_status, comment }
}

// Helper function to force merge status for PRs merged externally
async function force_merge_status(change_request_id, pr_number, comment) {
  log(
    `Forcing status update to Merged for PR ${pr_number} that was merged on GitHub`
  )

  try {
    const now = new Date()

    // First update the database directly
    const updated_cr = await db('change_requests')
      .where({ change_request_id })
      .update({
        status: 'Merged',
        merged_at: now,
        updated_at: now
      })
      .returning('*')

    // Then try to update the markdown file
    try {
      await update_markdown_file({
        change_request_id,
        status: 'Merged',
        now,
        updater_id: 'system:github',
        comment: comment || 'Merged externally via GitHub'
      })
    } catch (md_error) {
      log(`Warning: Couldn't update markdown file: ${md_error.message}`)
    }

    return updated_cr[0]
  } catch (error) {
    log(`Error forcing merge status: ${error.message}`)
    return null
  }
}
