/**
 * Branch utilities for file operations
 *
 * Helper functions to determine which branch to target for file operations.
 */

import debug from 'debug'

// Setup logger
const log = debug('files:utils:branch')

// Main branch name constant
export const MAIN_BRANCH_NAME = 'main'

/**
 * Get the target branch name for file operations
 * Note: This does not check if the branch exists - that's handled by the caller
 *
 * @param {Object} params - Parameters
 * @param {string} [params.thread_id] - Thread ID to determine branch
 * @param {string} params.repo_path - Repository path
 * @returns {Object} Object with branch_name and repo_path
 */
export function get_target_branch({ thread_id, repo_path }) {
  if (!repo_path) {
    throw new Error('repo_path must be provided')
  }

  const target_thread_id = thread_id

  let branch_name

  // If a thread is specified, use its branch
  if (target_thread_id) {
    log(`Determining branch name for thread: ${target_thread_id}`)
    branch_name = `thread/${target_thread_id}`
  }

  // Validate branch is not main unless explicitly allowed
  if (branch_name === MAIN_BRANCH_NAME) {
    throw new Error('Cannot perform this operation directly on the main branch')
  }

  if (!branch_name) {
    throw new Error('Could not determine branch name')
  }

  log(`Determined branch name: ${branch_name} for repo: ${repo_path}`)
  return { branch_name, repo_path }
}
