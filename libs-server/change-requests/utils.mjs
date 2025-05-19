/**
 * Change Request Utilities
 *
 * This module provides utility functions for working with change requests,
 * including Git operations that treat Git as the source of truth.
 */

import * as git_ops from '#libs-server/git/index.mjs'
import config from '#config'
import debug from 'debug'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/write-entity-to-filesystem.mjs'
import { CHANGE_REQUEST_DIR } from './constants.mjs'

const log = debug('change-requests')

/**
 * Get commits that exist in a feature branch but not in the target branch
 */
export async function get_change_request_commits({
  feature_branch,
  target_branch,
  user_base_directory = config.user_base_directory
}) {
  try {
    // Verify user_base_directory exists
    const fs = await import('fs/promises')
    const path = await import('path')

    const resolved_path = path.resolve(user_base_directory)
    try {
      const stat = await fs.stat(resolved_path)
      if (!stat.isDirectory()) {
        throw new Error(`Repository path is not a directory: ${resolved_path}`)
      }
    } catch (error) {
      throw new Error(`Repository path does not exist: ${resolved_path}`)
    }

    // Use the git operation to get commits with their diffs
    return await git_ops.get_commits_with_diffs({
      user_base_directory,
      from_ref: target_branch,
      to_ref: feature_branch
    })
  } catch (error) {
    console.error(
      `Failed to get commits between ${target_branch} and ${feature_branch}:`,
      error
    )
    throw new Error(`Failed to get commits: ${error.message}`)
  }
}

/**
 * Merge a feature branch into a target branch for a change request
 * @returns {Promise<Object>} Result object with success status and merge commit hash
 */
export async function merge_branch_for_change_request({
  target_branch,
  feature_branch,
  merge_message,
  delete_branch = true,
  user_base_directory = '.'
}) {
  // Check if branches exist
  const target_exists = await git_ops.branch_exists({
    user_base_directory,
    branch_name: target_branch
  })

  const feature_exists = await git_ops.branch_exists({
    user_base_directory,
    branch_name: feature_branch
  })

  if (!target_exists || !feature_exists) {
    throw new Error(
      `Branch not found: ${!target_exists ? target_branch : feature_branch}`
    )
  }

  // Merge the feature branch into the target branch
  await git_ops.checkout_branch({
    repo_path: user_base_directory,
    branch_name: target_branch
  })

  const merge_result = await git_ops.merge_branch({
    repo_path: user_base_directory,
    branch_to_merge: feature_branch,
    merge_message
  })

  // Optionally delete the feature branch after merging
  if (delete_branch) {
    await git_ops.delete_branch({
      repo_path: user_base_directory,
      branch_name: feature_branch,
      force: false
    })
  }

  return {
    success: true,
    merge_commit_hash: merge_result.merge_commit_hash
  }
}

/**
 * Build change request data from Git information
 * @param {Object} params - Parameters for building the change request
 * @param {String} params.feature_branch - Feature branch name
 * @param {String} params.target_branch - Target branch name
 * @param {String} [params.merge_commit_hash] - Optional merge commit hash to use when feature branch is deleted
 * @param {String} [params.user_base_directory=config.user_base_directory] - Repository path
 * @returns {Promise<Object|null>} Change request data object or null if feature branch doesn't exist
 */
export async function build_change_request_from_git({
  feature_branch,
  target_branch,
  merge_commit_hash,
  user_base_directory = config.user_base_directory
}) {
  let commits = []
  const branch_info = {
    name: feature_branch,
    target: target_branch,
    commits: 0,
    is_branch_deleted: false
  }

  // First try to get commits from the feature branch
  try {
    // Check if feature branch exists
    const feature_exists = await git_ops.branch_exists({
      repo_path: user_base_directory,
      branch_name: feature_branch
    })

    // Check if target branch exists
    const target_exists = await git_ops.branch_exists({
      repo_path: user_base_directory,
      branch_name: target_branch
    })

    // Return null if either branch doesn't exist
    if (!feature_exists) {
      return {
        exists: false,
        error: `Feature branch '${feature_branch}' does not exist`
      }
    }

    if (!target_exists) {
      return {
        exists: false,
        error: `Target branch '${target_branch}' does not exist`
      }
    }

    if (feature_exists) {
      // If feature branch exists, get commits in the normal way
      commits = await get_change_request_commits({
        feature_branch,
        target_branch,
        user_base_directory
      })

      branch_info.commits = commits.length
    } else {
      // Branch doesn't exist, mark as deleted
      branch_info.is_branch_deleted = true

      // If merge commit hash is provided, use it to get commit info
      if (merge_commit_hash) {
        const merge_commit = await git_ops.get_merge_commit_info({
          repo_path: user_base_directory,
          commit_hash: merge_commit_hash
        })

        if (merge_commit) {
          commits = [merge_commit]
          branch_info.commits = 1
          branch_info.merge_commit_hash = merge_commit_hash
        }
      }
    }
  } catch (error) {
    console.error('Error in build_change_request_from_git:', error)
    // Return null with error message if there was an exception
    return {
      exists: false,
      error: error.message
    }
  }

  return {
    exists: true,
    feature_branch,
    target_branch,
    commits,
    branch_info
  }
}

/**
 * Updates the markdown file for a change request with the new status and optional comment.
 *
 * @param {object} params - Parameters for updating the markdown file.
 * @param {string} params.change_request_id - The ID of the change request to update.
 * @param {string} params.status - The new status.
 * @param {Date} params.now - The timestamp for the update.
 * @param {string} [params.updater_id] - The ID of the user updating the status.
 * @param {string} [params.comment] - Optional comment explaining the status change.
 * @param {string} [params.user_base_directory] - Optional repository path.
 */
export async function update_markdown_file({
  change_request_id,
  status,
  now,
  updater_id,
  comment,
  user_base_directory
}) {
  // Initialize path imports
  const path = await import('path')

  // Build the file path using user_base_directory if provided
  const relative_file_path = `${CHANGE_REQUEST_DIR}/${change_request_id}.md`
  const absolute_path = user_base_directory
    ? path.join(user_base_directory, relative_file_path)
    : relative_file_path

  try {
    const markdown_data = await read_entity_from_filesystem({
      absolute_path
    })

    if (!markdown_data.success) {
      throw new Error(markdown_data.error)
    }

    const updated_entity_properties = {
      ...markdown_data.entity_properties,
      status,
      updated_at: now.toISOString()
    }

    if (status === 'Merged') {
      updated_entity_properties.merged_at = now.toISOString()
    } else if (status === 'Closed' || status === 'Rejected') {
      updated_entity_properties.closed_at = now.toISOString()
    }

    // Add comment to content if provided
    let content = markdown_data.entity_content || ''
    if (comment) {
      const timestamp = now.toISOString()
      const update_block = `\n\n## Status Update: ${status} (${timestamp})\n`
      content += update_block

      if (updater_id) {
        content += `\nBy: ${updater_id}\n`
      }

      content += `\n${comment}\n`
    }

    // Write updated content using write_entity_to_filesystem
    await write_entity_to_filesystem({
      absolute_path,
      entity_properties: updated_entity_properties,
      entity_type: 'change_request',
      entity_content: content
    })
  } catch (error) {
    log(`Error updating markdown file: ${error.message}`)
    throw error
  }
}
