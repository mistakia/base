/**
 * Write file implementation for Base
 *
 * Handles creating new files and updating existing files by applying patches
 * within Git branches.
 */

import path from 'path'
import debug from 'debug'

import * as git from '#libs-server/git/index.mjs'
import { get_target_branch } from '#libs-server/base-files/branch-utils.mjs'
import { write_file_to_filesystem } from '#libs-server/filesystem/write-file-to-filesystem.mjs'

const log = debug('files:write')

/**
 * Write a file to a repository, supporting both new files and patches
 *
 * @param {Object} params - The parameters for writing a file
 * @param {string} params.path - The file path relative to the repository root
 * @param {string} [params.content] - The full content of the file (for new files or complete replacements)
 * @param {string} [params.patch_content] - Git patch content to apply (for partial updates)
 * @param {string} [params.operation='update'] - Operation type: 'create', 'update', or 'delete'
 * @param {string} params.repo_path - The path to the repository
 * @param {string} [params.thread_id] - Thread ID to infer branch if branch_name not provided
 * @param {string} [params.branch_name] - Explicit branch name to use
 * @param {string} [params.commit_message] - Commit message for the change
 * @returns {Promise<Object>} Result of the operation
 */
export async function write_file({
  path: file_path,
  content,
  patch_content,
  operation = 'update',
  repo_path,
  thread_id,
  branch_name,
  commit_message
}) {
  if (!file_path) {
    throw new Error('File path is required')
  }

  if (operation === 'update' && !content && !patch_content) {
    throw new Error(
      'Either content or patch_content must be provided for update operations'
    )
  }

  if (!repo_path) {
    throw new Error('Repository path is required')
  }

  try {
    // Determine the target branch if not explicitly provided
    let target_branch = branch_name

    if (!target_branch) {
      const branch_info = await get_target_branch({
        thread_id,
        repo_path
      })

      target_branch = branch_info.branch_name
    }

    log(
      `Writing to file ${file_path} in branch ${target_branch} at ${repo_path}`
    )

    // Check if branch exists - fail if it doesn't
    const branch_exists = await git.branch_exists({
      repo_path,
      branch_name: target_branch,
      check_remote: false
    })

    if (!branch_exists) {
      throw new Error(`Branch ${target_branch} does not exist`)
    }

    // Create worktree for the branch
    const worktree_path = await git.create_worktree({
      repo_path,
      branch_name: target_branch
    })

    log(`Created worktree at ${worktree_path} for branch ${target_branch}`)

    try {
      // Perform the requested operation
      if (operation === 'delete') {
        // Handle file deletion
        try {
          // Delete the file and stage the deletion using git.delete_file
          await git.delete_file({
            repo_path: worktree_path,
            file_path
          })
          log(`Deleted file ${file_path}`)
        } catch (error) {
          log(`Error deleting file ${file_path}:`, error)
          throw new Error(
            `Failed to delete file ${file_path}: ${error.message}`
          )
        }
      } else if (content !== undefined) {
        // Handle file creation or complete replacement
        const full_file_path = path.join(worktree_path, file_path)
        await write_file_to_filesystem({
          absolute_path: full_file_path,
          file_content: content
        })
        await git.add_files({
          worktree_path,
          files_to_add: file_path
        })
        log(`Wrote content to ${file_path} and staged changes`)
      } else if (patch_content) {
        // Apply patch
        await git.apply_patch({
          repo_path: worktree_path,
          patch_content
        })
        log(`Applied patch to ${file_path}`)
      }

      // Commit changes if a commit message is provided
      if (commit_message) {
        try {
          await git.commit_changes({
            worktree_path,
            commit_message
          })
          log(`Committed changes with message: ${commit_message}`)
        } catch (error) {
          // git.commit_changes already handles "nothing to commit" errors
          log('No changes to commit')
          return {
            success: true,
            message: 'No changes to commit',
            branch: target_branch,
            file_path
          }
        }
      }

      return {
        success: true,
        message: 'File operation completed successfully',
        branch: target_branch,
        file_path,
        operation
      }
    } finally {
      // Clean up worktree
      await git.remove_worktree({
        repo_path,
        worktree_path
      })
      log(`Cleaned up worktree at ${worktree_path}`)
    }
  } catch (error) {
    log(`Error writing file ${file_path}:`, error)
    return {
      success: false,
      error: error.message,
      file_path
    }
  }
}

// Default export for convenient importing
export default {
  write_file
}
