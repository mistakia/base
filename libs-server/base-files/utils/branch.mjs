/**
 * Branch utilities for file operations
 *
 * Helper functions to determine which branch to target for file operations.
 */

import debug from 'debug'

// Setup logger
const log = debug('files:utils:branch')

/**
 * Get the target branch name for file operations
 * Note: This does not check if the branch exists - that's handled by the caller
 *
 * @param {Object} params - Parameters
 * @param {string} [params.thread_id] - Thread ID to determine branch
 * @param {string} params.repo_path - Repository path
 * @param {Object} [params.context={}] - Context object that may contain thread_id
 * @returns {Object} Object with branch_name and repo_path
 */
export function get_target_branch({ thread_id, repo_path, context = {} }) {
  if (!repo_path) {
    throw new Error('repo_path must be provided')
  }

  // Use thread_id from context if not provided directly
  const target_thread_id = thread_id || context.thread_id

  let branch_name = 'main'

  // If a thread is specified, use its branch
  if (target_thread_id) {
    log(`Determining branch name for thread: ${target_thread_id}`)
    branch_name = `thread/${target_thread_id}`
  }

  log(`Determined branch name: ${branch_name} for repo: ${repo_path}`)
  return { branch_name, repo_path }
}
