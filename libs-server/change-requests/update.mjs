import debug from 'debug'

import db from '#db'
import {
  merge_branch_for_change_request,
  update_markdown_file
} from './utils.mjs'
import { VALID_STATUSES, VALID_TRANSITIONS } from './constants.mjs'
import { get_change_request } from './retrieve.mjs'

const log = debug('change-requests')

/**
 * Updates the status of a change request.
 *
 * @param {object} params - Parameters for updating the change request status.
 * @param {string} params.change_request_id - The ID of the change request to update.
 * @param {string} params.status - The new status ('Draft', 'PendingReview', 'Approved', 'NeedsRevision', 'Rejected', 'Merged', 'Closed').
 * @param {string} [params.updater_id] - The ID of the user updating the status.
 * @param {string} [params.comment] - Optional comment explaining the status change.
 * @param {string} [params.user_base_directory] - Optional repository path.
 * @returns {Promise<object>} The updated change request object.
 */
export async function update_change_request_status({
  change_request_id,
  status,
  updater_id,
  comment,
  user_base_directory
}) {
  log(`Updating status of change request ${change_request_id} to ${status}`)

  // Validate status and transitions
  const { valid_status, current_cr } = await validate_status_transition({
    change_request_id,
    status,
    user_base_directory
  })
  if (!valid_status) {
    throw new Error(
      `Invalid status transition: Cannot transition change request from ${current_cr.status} to ${status}.`
    )
  }

  const now = new Date()
  const update_data = prepare_update_data(status, now)

  // Update the database record and markdown file in a transaction
  await db.transaction(async (trx) => {
    await update_database_record(trx, change_request_id, update_data)
    await update_markdown_file({
      change_request_id,
      status,
      now,
      updater_id,
      comment,
      user_base_directory
    })
  })

  // Get and return the updated change request
  return await verify_update({ change_request_id, status, user_base_directory })
}

/**
 * Merges a change request into the target branch.
 *
 * @param {object} params - Parameters for merging the change request.
 * @param {string} params.change_request_id - The ID of the change request to merge.
 * @param {string} [params.merger_id] - The ID of the user performing the merge.
 * @param {string} [params.merge_message] - Optional custom merge message.
 * @param {boolean} [params.delete_branch=true] - Whether to delete the feature branch after merging.
 * @param {string} [params.user_base_directory] - Optional repository path.
 * @returns {Promise<object>} The updated change request object.
 */
export async function merge_change_request({
  change_request_id,
  merger_id,
  merge_message,
  delete_branch = true,
  user_base_directory
}) {
  log(`Merging change request ${change_request_id}`)

  // Get and validate the change request
  const change_request = await validate_mergeable({
    change_request_id,
    user_base_directory
  })
  const { feature_branch, target_branch } = change_request

  try {
    // Use centralized Git operations from utils.mjs
    const merge_result = await merge_branch_for_change_request({
      target_branch,
      feature_branch,
      merge_message:
        merge_message ||
        `Merging change request: ${change_request_id}\n\n${change_request.title}`,
      delete_branch,
      user_base_directory
    })

    // Get the merge commit hash
    const { merge_commit_hash } = merge_result

    // Store the merge commit hash in the database
    await db('change_requests')
      .where({ change_request_id })
      .update({ merge_commit_hash })

    // Update the change request status
    const comment = `Merged change request ${change_request_id} into ${target_branch}.${merger_id ? ` Merged by ${merger_id}.` : ''} Merge commit: ${merge_commit_hash}`
    const updated_cr = await update_change_request_status({
      change_request_id,
      status: 'Merged',
      updater_id: merger_id || 'system',
      comment,
      user_base_directory
    })

    return updated_cr
  } catch (error) {
    log(`Error merging change request: ${error.message}`)
    throw new Error(`Cannot merge change request: ${error.message}`)
  }
}

// Helper function to validate status and transitions
async function validate_status_transition({
  change_request_id,
  status,
  user_base_directory
}) {
  if (!VALID_STATUSES.includes(status)) {
    throw new Error(
      `Invalid status: ${status}. Must be one of: ${VALID_STATUSES.join(', ')}`
    )
  }

  // Get current status to validate transitions
  const current_cr = await get_change_request({
    change_request_id,
    user_base_directory
  })
  if (!current_cr) {
    throw new Error(`Change request with ID ${change_request_id} not found.`)
  }

  // Check if transition is valid
  const is_valid =
    current_cr.status === status ||
    (VALID_TRANSITIONS[current_cr.status] &&
      VALID_TRANSITIONS[current_cr.status].includes(status))

  return {
    valid_status: is_valid,
    current_cr
  }
}

// Helper function to prepare update data
function prepare_update_data(status, now) {
  const update_data = {
    status,
    updated_at: now
  }

  // Add timestamps for terminal states
  if (status === 'Merged') {
    update_data.merged_at = now
  } else if (status === 'Closed' || status === 'Rejected') {
    update_data.closed_at = now
  } else if (
    ['Draft', 'PendingReview', 'Approved', 'NeedsRevision'].includes(status)
  ) {
    // Clear closed_at when reopening from a closed state
    update_data.closed_at = null
  }

  return update_data
}

// Helper function to update the database record
async function update_database_record(trx, change_request_id, update_data) {
  const [updated_record] = await trx('change_requests')
    .where({ change_request_id })
    .update(update_data)
    .returning('*')

  if (!updated_record) {
    throw new Error(`Change request with ID ${change_request_id} not found.`)
  }

  return updated_record
}

// Helper function to validate that a change request is mergeable
async function validate_mergeable({ change_request_id, user_base_directory }) {
  const change_request = await get_change_request({
    change_request_id,
    user_base_directory
  })

  if (!change_request) {
    throw new Error(`Change request with ID ${change_request_id} not found.`)
  }

  if (change_request.status !== 'Approved') {
    throw new Error(
      `Cannot merge change request with status: ${change_request.status}. Must be 'Approved'.`
    )
  }

  return change_request
}

// Helper function to verify the update was successful
async function verify_update({ change_request_id, status, user_base_directory }) {
  const updated_cr = await get_change_request({
    change_request_id,
    user_base_directory
  })

  if (!updated_cr) {
    throw new Error(`Failed to update change request ${change_request_id}.`)
  }

  if (updated_cr.status !== status) {
    throw new Error(`Failed to update change request status to ${status}.`)
  }

  return updated_cr
}
