import debug from 'debug'

import { create_worktree, remove_worktree } from '../worktree-operations.mjs'
import { commit_changes } from '../commit-operations.mjs'
import { branch_exists } from '../branch-operations.mjs'
import { delete_file } from '../file-operations.mjs'

const log = debug('git:delete-file-from-git')

/**
 * Deletes a file from a git repository
 * @param {Object} params - Parameters
 * @param {string} params.repo_path - Path to the repository
 * @param {string} params.git_relative_path - Path to the file relative to repo root
 * @param {string} params.branch - Branch to delete from
 * @param {string} [params.commit_message] - Optional commit message
 * @param {boolean} [params.force=false] - Force removal even if file has local modifications
 * @returns {Promise<Object>} - Result of the operation
 */
export async function delete_file_from_git({
  repo_path,
  git_relative_path,
  branch,
  commit_message,
  force = false
}) {
  if (!repo_path) {
    throw new Error('Repository path is required')
  }

  if (!git_relative_path) {
    throw new Error('Git relative path is required')
  }

  if (!branch) {
    throw new Error('Branch is required')
  }

  try {
    log(
      `Deleting file ${git_relative_path} in branch ${branch} at ${repo_path}`
    )

    // Check if branch exists - fail if it doesn't
    const branch_check = await branch_exists({
      repo_path,
      branch_name: branch,
      check_remote: false
    })

    if (!branch_check) {
      throw new Error(`Branch ${branch} does not exist`)
    }

    // Create worktree for the branch
    const worktree_path = await create_worktree({
      repo_path,
      branch_name: branch
    })

    log(`Created worktree at ${worktree_path} for branch ${branch}`)

    try {
      // Delete the file from the worktree
      await delete_file({
        repo_path: worktree_path,
        file_path: git_relative_path,
        force
      })

      log(`Deleted file ${git_relative_path} and staged deletion`)

      // Commit changes if a commit message is provided
      if (commit_message) {
        try {
          await commit_changes({
            worktree_path,
            commit_message
          })
          log(`Committed changes with message: ${commit_message}`)
        } catch (error) {
          // commit_changes already handles "nothing to commit" errors
          log('No changes to commit')
          return {
            success: true,
            message: 'No changes to commit',
            branch,
            git_relative_path
          }
        }
      }

      return {
        success: true,
        message: 'File deletion completed successfully',
        branch,
        git_relative_path
      }
    } finally {
      // Clean up worktree
      await remove_worktree({
        repo_path,
        worktree_path
      })
      log(`Cleaned up worktree at ${worktree_path}`)
    }
  } catch (error) {
    log(`Error deleting file ${git_relative_path}:`, error)
    return {
      success: false,
      error: error.message,
      git_relative_path
    }
  }
}
