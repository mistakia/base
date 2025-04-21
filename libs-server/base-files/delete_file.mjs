/**
 * File deletion implementation for Base
 *
 * Handles deleting files within Git branches.
 */

import debug from 'debug'

import * as git from '#libs-server/git/index.mjs'
import { get_target_branch } from './branch_utils.mjs'

const log = debug('files:delete')

/**
 * Delete a file from a repository
 *
 * @param {Object} params - The parameters for deleting a file
 * @param {string} params.path - The file path relative to the repository root
 * @param {string} params.repo_path - The path to the repository
 * @param {string} [params.thread_id] - Thread ID to infer branch if branch_name not provided
 * @param {string} [params.branch_name] - Explicit branch name to use
 * @param {string} [params.commit_message] - Commit message for the deletion
 * @param {boolean} [params.force=false] - Force removal even if file has local modifications
 * @returns {Promise<Object>} Result of the operation
 */
export async function delete_file({
  path: file_path,
  repo_path,
  thread_id,
  branch_name,
  commit_message,
  force = false
}) {
  if (!file_path) {
    throw new Error('File path is required')
  }

  if (!repo_path) {
    throw new Error('Repository path is required')
  }

  try {
    const { branch_name: target_branch_name, repo_path: target_repo_path } =
      await get_target_branch({
        thread_id,
        branch_name,
        repo_path
      })

    log(
      `Deleting file ${file_path} in branch ${target_branch_name} at ${target_repo_path}`
    )

    // Check if branch exists - fail if it doesn't
    const branch_exists = await git.branch_exists({
      repo_path: target_repo_path,
      branch_name: target_branch_name,
      check_remote: false
    })

    if (!branch_exists) {
      throw new Error(`Branch ${target_branch_name} does not exist`)
    }

    // Create worktree for the branch
    const worktree_path = await git.create_worktree({
      repo_path: target_repo_path,
      branch_name: target_branch_name
    })

    log(`Created worktree at ${worktree_path} for branch ${target_branch_name}`)

    try {
      // Delete the file using git.delete_file
      await git.delete_file({
        repo_path: worktree_path,
        file_path,
        force
      })

      log(`Deleted file ${file_path}`)

      // Commit changes if a commit message is provided
      if (commit_message) {
        try {
          await git.commit_changes({
            worktree_path,
            commit_message
          })
          log(`Committed deletion with message: ${commit_message}`)
        } catch (error) {
          // git.commit_changes already handles "nothing to commit" errors
          log('No changes to commit')
          return {
            success: true,
            message: 'No changes to commit',
            branch: target_branch_name,
            file_path
          }
        }
      }

      return {
        success: true,
        message: 'File deleted successfully',
        branch: target_branch_name,
        file_path
      }
    } finally {
      // Clean up worktree
      await git.remove_worktree({
        repo_path: target_repo_path,
        worktree_path
      })
      log(`Cleaned up worktree at ${worktree_path}`)
    }
  } catch (error) {
    log(`Error deleting file ${file_path}:`, error)
    return {
      success: false,
      error: error.message,
      file_path
    }
  }
}

// Default export for convenient importing
export default {
  delete_file
}
