/**
 * File listing operations
 *
 * This module provides functionality for listing files in Git repositories.
 */

import debug from 'debug'
import * as git_ops from '#libs-server/git/index.mjs'
import { get_target_branch } from './branch_utils.mjs'

// Setup logger
const log = debug('files:list')

/**
 * List files within a directory in a specific branch
 *
 * @param {Object} params - Parameters
 * @param {string} [params.path=''] - Directory path to list files from
 * @param {string} [params.pattern='*'] - Glob pattern to filter files
 * @param {string} [params.thread_id] - Thread ID to determine branch
 * @param {string} [params.branch_name] - Branch name to use (takes precedence over thread_id)
 * @param {string} [params.repo_path] - Repository path (for testing)
 * @returns {Promise<Object>} Object containing file list
 */
export async function list_files({
  path: list_path = '',
  pattern = '*',
  thread_id,
  branch_name,
  repo_path
}) {
  try {
    const { branch_name: target_branch_name, repo_path: target_repo_path } =
      await get_target_branch({
        thread_id,
        branch_name,
        repo_path
      })

    // Combine path and pattern for git_ops.list_files if path is provided
    // Ensure no leading/trailing slashes interfere
    const clean_path = list_path.replace(/^\/|\/$/g, '')
    const path_pattern = clean_path ? `${clean_path}/${pattern}` : pattern

    log(
      `Listing files in path "${list_path}" with pattern "${pattern}" (using path_pattern "${path_pattern}") from branch ${target_branch_name} in repo ${target_repo_path}`
    )

    const files = await git_ops.list_files({
      repo_path: target_repo_path,
      ref: target_branch_name,
      path_pattern
    })

    return { files }
  } catch (error) {
    log(
      `Error listing files for path "${list_path}", pattern "${pattern}":`,
      error
    )

    throw new Error(`Failed to list files: ${error.message}`)
  }
}

// Default export for convenient importing
export default {
  list_files
}
