import debug from 'debug'

import db from '#db'
import * as git_ops from '#libs-server/git/git_operations.mjs'
import {
  read_markdown_entity,
  write_markdown_entity
} from '#libs-server/markdown/index.mjs'
import {
  CHANGE_REQUEST_DIR,
  VALID_STATUSES,
  VALID_TRANSITIONS
} from './constants.mjs'
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
 * @returns {Promise<object>} The updated change request object.
 */
export async function update_change_request_status({
  change_request_id,
  status,
  updater_id,
  comment
}) {
  log(`Updating status of change request ${change_request_id} to ${status}`)

  // Validate status and transitions
  const { valid_status, current_cr } = await validate_status_transition(
    change_request_id,
    status
  )
  if (!valid_status) {
    throw new Error(
      `Cannot transition change request from ${current_cr.status} to ${status}.`
    )
  }

  const now = new Date()
  const update_data = prepare_update_data(status, now)

  // Update the database record and markdown file in a transaction
  await db.transaction(async (trx) => {
    await update_database_record(trx, change_request_id, update_data)
    await update_markdown_file(
      change_request_id,
      status,
      now,
      updater_id,
      comment
    )
  })

  // Get and return the updated change request
  return await verify_update(change_request_id, status)
}

/**
 * Merges a change request into the target branch.
 *
 * @param {object} params - Parameters for merging the change request.
 * @param {string} params.change_request_id - The ID of the change request to merge.
 * @param {string} [params.merger_id] - The ID of the user performing the merge.
 * @param {string} [params.merge_message] - Optional custom merge message.
 * @param {boolean} [params.delete_branch=true] - Whether to delete the feature branch after merging.
 * @returns {Promise<object>} The updated change request object.
 */
export async function merge_change_request({
  change_request_id,
  merger_id,
  merge_message,
  delete_branch = true
}) {
  log(`Merging change request ${change_request_id}`)

  // Get and validate the change request
  const change_request = await validate_mergeable(change_request_id)
  const { feature_branch, target_branch } = change_request
  const repo_path = '.' // Assuming operations run from the root of the repo

  try {
    // Perform Git operations
    await perform_merge_operations({
      repo_path,
      target_branch,
      feature_branch,
      merge_message:
        merge_message ||
        `Merging test CR: ${change_request_id}\n\n${change_request.title}`,
      delete_branch
    })

    // Update the change request status
    const comment = `Merged change request ${change_request_id} into ${target_branch}.${merger_id ? ` Merged by ${merger_id}.` : ''}`
    const updated_cr = await update_change_request_status({
      change_request_id,
      status: 'Merged',
      updater_id: merger_id || 'system',
      comment
    })

    return updated_cr
  } catch (error) {
    log(`Error merging change request ${change_request_id}:`, error)
    throw error
  }
}

// Helper function to validate status and transitions
async function validate_status_transition(change_request_id, status) {
  if (!VALID_STATUSES.includes(status)) {
    throw new Error(
      `Invalid status: ${status}. Must be one of: ${VALID_STATUSES.join(', ')}`
    )
  }

  // Get current status to validate transitions
  const current_cr = await get_change_request({ change_request_id })
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

// Helper function to update the markdown file
async function update_markdown_file(
  change_request_id,
  status,
  now,
  updater_id,
  comment
) {
  const file_path = `${CHANGE_REQUEST_DIR}/${change_request_id}.md`
  try {
    const markdown_data = await read_markdown_entity(file_path)

    // Update frontmatter explicitly
    const new_frontmatter = {
      ...markdown_data.frontmatter,
      status,
      updated_at: now.toISOString()
    }

    if (status === 'Merged') {
      new_frontmatter.merged_at = now.toISOString()
    } else if (status === 'Closed' || status === 'Rejected') {
      new_frontmatter.closed_at = now.toISOString()
    }

    // Add comment to content if provided
    let content = markdown_data.content || ''
    if (comment) {
      const comment_block = `\n\n## Status Update: ${status}\n\n${comment}\n\n_Updated by ${updater_id || 'system'} on ${now.toISOString()}_`
      content += comment_block
    }

    // Write back to file
    await write_markdown_entity(file_path, new_frontmatter, content)
    log(`Updated markdown file for ${change_request_id} with status: ${status}`)
  } catch (error) {
    log(
      `Warning: Could not update markdown file for ${change_request_id}: ${error.message}`
    )
    // Continue even if file update fails
  }
}

// Helper function to verify the update
async function verify_update(change_request_id, expected_status) {
  try {
    const updated_cr = await get_change_request({ change_request_id })
    if (!updated_cr) {
      throw new Error(
        `Change request ${change_request_id} not found after update.`
      )
    }

    // Double-check that the status was updated correctly
    if (updated_cr.status !== expected_status) {
      log(
        `Warning: Change request status was not updated properly. Expected ${expected_status}, got ${updated_cr.status}`
      )
    }

    return updated_cr
  } catch (error) {
    log(`Error retrieving updated change request: ${error.message}`)
    throw new Error(`Failed to verify change request update: ${error.message}`)
  }
}

// Helper function to validate if a change request can be merged
async function validate_mergeable(change_request_id) {
  const change_request = await get_change_request({ change_request_id })

  if (!change_request) {
    throw new Error(`Change request with ID ${change_request_id} not found.`)
  }

  if (change_request.status === 'Merged') {
    throw new Error(`Change request ${change_request_id} is already merged.`)
  }

  if (
    change_request.status === 'Closed' ||
    change_request.status === 'Rejected'
  ) {
    throw new Error(
      `Cannot merge change request ${change_request_id} with status ${change_request.status}.`
    )
  }

  return change_request
}

// Helper function to perform Git merge operations
async function perform_merge_operations({
  repo_path,
  target_branch,
  feature_branch,
  merge_message,
  delete_branch
}) {
  // 1. Make sure we're on the target branch
  await git_ops.checkout_branch({ repo_path, branch_name: target_branch })
  log(`Checked out target branch ${target_branch}`)

  // 2. Merge the feature branch
  await git_ops.merge_branch({
    repo_path,
    branch_to_merge: feature_branch,
    merge_message
  })
  log(`Merged ${feature_branch} into ${target_branch}`)

  // 3. Delete the feature branch if requested
  if (delete_branch) {
    await git_ops.delete_branch({
      repo_path,
      branch_name: feature_branch
    })
    log(`Deleted feature branch ${feature_branch}`)
  }
}
