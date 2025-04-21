/**
 * Batch file writing operations
 *
 * This module provides functionality for writing multiple files at once
 * within Git branches.
 */

import debug from 'debug'
import path from 'path'
import fs from 'fs/promises'

import * as git from '#libs-server/git/index.mjs'
import { get_target_branch } from './branch_utils.mjs'

const log = debug('files:write:batch')

/**
 * Write multiple files to a repository, optionally with a single commit
 *
 * @param {Object} params - The parameters for batch writing files
 * @param {Array<Object>} params.files - Array of file operations to perform
 * @param {string} params.files[].path - The file path relative to the repository root
 * @param {string} [params.files[].content] - The full content of the file (for new/update)
 * @param {string} [params.files[].patch_content] - Git patch content to apply
 * @param {string} [params.files[].operation='update'] - Operation type: 'create', 'update', or 'delete'
 * @param {string} params.repo_path - The path to the repository
 * @param {string} [params.thread_id] - Thread ID to infer branch if branch_name not provided
 * @param {string} [params.branch_name] - Explicit branch name to use
 * @param {string} [params.commit_message] - Single commit message for all changes
 * @param {boolean} [params.commit_per_file=false] - Whether to commit each file separately
 * @returns {Promise<Object>} Result of the batch operation
 */
export async function batch_write_files({
  files,
  repo_path,
  thread_id,
  branch_name,
  commit_message,
  commit_per_file = false
}) {
  if (!files || !Array.isArray(files) || files.length === 0) {
    throw new Error('At least one file operation must be provided')
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
      `Batch writing ${files.length} files in branch ${target_branch} at ${repo_path}`
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

    const results = []
    let any_changes = false

    try {
      // Process each file
      for (const file_op of files) {
        const {
          path: file_path,
          content,
          patch_content,
          operation = 'update'
        } = file_op

        if (!file_path) {
          results.push({
            success: false,
            error: 'File path is required',
            operation
          })
          continue
        }

        if (operation === 'update' && !content && !patch_content) {
          results.push({
            success: false,
            error:
              'Either content or patch_content must be provided for update operations',
            file_path,
            operation
          })
          continue
        }

        try {
          // Perform the requested operation
          if (operation === 'delete') {
            // Handle file deletion
            try {
              await git.delete_file({
                repo_path: worktree_path,
                file_path
              })
              log(`Deleted file ${file_path}`)
              any_changes = true
            } catch (error) {
              log(`Error deleting file ${file_path}:`, error)
              results.push({
                success: false,
                error: `Failed to delete file: ${error.message}`,
                file_path,
                operation
              })
              continue
            }
          } else if (content !== undefined) {
            // Handle file creation or complete replacement
            const full_file_path = path.join(worktree_path, file_path)
            await git.ensure_directory(path.dirname(full_file_path))
            await fs.writeFile(full_file_path, content)
            await git.add_files({
              worktree_path,
              files_to_add: file_path
            })
            log(`Wrote content to ${file_path} and staged changes`)
            any_changes = true
          } else if (patch_content) {
            // Apply patch
            await git.apply_patch({
              repo_path: worktree_path,
              patch_content
            })
            log(`Applied patch to ${file_path}`)
            any_changes = true
          }

          // Commit per file if requested
          if (commit_per_file && file_op.commit_message) {
            try {
              await git.commit_changes({
                worktree_path,
                commit_message: file_op.commit_message
              })
              log(
                `Committed changes to ${file_path} with message: ${file_op.commit_message}`
              )
            } catch (error) {
              // git.commit_changes already handles "nothing to commit" errors
              log(`No changes to commit for ${file_path}`)
            }
          }

          results.push({
            success: true,
            file_path,
            operation
          })
        } catch (error) {
          log(`Error processing file ${file_path}:`, error)
          results.push({
            success: false,
            error: error.message,
            file_path,
            operation
          })
        }
      }

      // Commit all changes in a single commit if requested
      if (!commit_per_file && commit_message && any_changes) {
        try {
          await git.commit_changes({
            worktree_path,
            commit_message
          })
          log(`Committed all changes with message: ${commit_message}`)
        } catch (error) {
          // git.commit_changes already handles "nothing to commit" errors
          log('No changes to commit')
        }
      }

      return {
        success: true,
        branch: target_branch,
        results,
        any_changes
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
    log('Error in batch file operation:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

// Default export for convenient importing
export default {
  batch_write_files
}
