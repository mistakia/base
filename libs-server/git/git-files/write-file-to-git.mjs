import path from 'path'
import debug from 'debug'

import {
  create_worktree,
  remove_worktree
} from '#libs-server/git/worktree-operations.mjs'
import {
  add_files,
  commit_changes
} from '#libs-server/git/commit-operations.mjs'
import { branch_exists } from '#libs-server/git/branch-operations.mjs'
import { write_file_to_filesystem } from '#libs-server/filesystem/write-file-to-filesystem.mjs'

const log = debug('git:write-file-to-git')

/**
 * Writes content to a file in a git repository
 * @param {Object} params - Parameters
 * @param {string} params.repo_path - Path to the repository
 * @param {string} params.git_relative_path - Path to the file relative to repo root
 * @param {string} params.content - Content to write to the file
 * @param {string} params.branch - Branch to write to
 * @param {string} [params.commit_message] - Optional commit message
 * @returns {Promise<Object>} - Result of the operation
 */
export async function write_file_to_git({
  repo_path,
  git_relative_path,
  content,
  branch,
  commit_message
}) {
  if (!repo_path) {
    throw new Error('Repository path is required')
  }

  if (!git_relative_path) {
    throw new Error('Git relative path is required')
  }

  if (content === undefined) {
    throw new Error('Content is required')
  }

  if (!branch) {
    throw new Error('Branch is required')
  }

  try {
    log(
      `Writing to file ${git_relative_path} in branch ${branch} at ${repo_path}`
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
      // Write the file to the worktree using write_file_to_filesystem
      const full_file_path = path.join(worktree_path, git_relative_path)
      await write_file_to_filesystem({
        absolute_path: full_file_path,
        file_content: content
      })

      // Stage the changes
      await add_files({
        worktree_path,
        files_to_add: git_relative_path
      })

      log(`Wrote content to ${git_relative_path} and staged changes`)

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
        message: 'File operation completed successfully',
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
    log(`Error writing file ${git_relative_path}:`, error)
    return {
      success: false,
      error: error.message,
      git_relative_path
    }
  }
}

export default write_file_to_git
