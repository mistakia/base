import debug from 'debug'
import db from '#db'

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
