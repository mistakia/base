/**
 * File diff operations
 *
 * This module provides functionality for getting diffs of files between branches.
 */

import debug from 'debug'
import * as git_ops from '#libs-server/git/index.mjs'
import { get_target_branch, MAIN_BRANCH_NAME } from './branch_utils.mjs'

// Setup logger
const log = debug('files:diff')

/**
 * Get the diff for a file or directory between branches
 *
 * @param {Object} params - Parameters
 * @param {string} [params.path] - Path to get diff for (if omitted, shows diff for entire branch)
 * @param {string} [params.compare_with=MAIN_BRANCH_NAME] - The base branch to compare against
 * @param {string} [params.format='unified'] - Diff format (unified, name-only, stat)
 * @param {string} [params.thread_id] - Thread ID to determine branch
 * @param {string} [params.branch_name] - Branch name to use (takes precedence over thread_id)
 * @param {string} [params.repo_path] - Repository path (for testing)
 * @returns {Promise<Object>} Object containing the diff
 */
export async function get_file_diff({
  path: diff_path,
  compare_with = MAIN_BRANCH_NAME,
  format = 'unified',
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

    log(
      `Getting diff for path "${diff_path || 'branch'}" in branch ${target_branch_name} compared to ${compare_with} in repo ${target_repo_path}`
    )

    const diff = await git_ops.get_diff({
      repo_path: target_repo_path,
      from_ref: compare_with,
      to_ref: target_branch_name,
      path: diff_path,
      format
    })

    return { diff }
  } catch (error) {
    log(
      `Error getting diff for path "${diff_path}" in branch compared to "${compare_with}":`,
      error
    )

    throw new Error(`Failed to get diff: ${error.message}`)
  }
}

// Default export for convenient importing
export default {
  get_file_diff
}
