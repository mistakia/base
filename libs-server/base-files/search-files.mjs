/**
 * File search service
 *
 * Provides functionality to search for content within files across repositories
 */
import debug from 'debug'

import { search_repository } from '#libs-server/git/index.mjs'
import { get_target_branch } from '#libs-server/base-files/branch-utils.mjs'

const log = debug('files:search')

/**
 * Search for content in files
 *
 * @param {Object} params - Search parameters
 * @param {string} params.query - The text to search for
 * @param {string} [params.repo_path] - Repository path to search in
 * @param {string} [params.path] - Optional path within repo to limit search
 * @param {boolean} [params.case_sensitive=false] - Whether search is case sensitive
 * @param {string} [params.branch_name] - Branch name to use (takes precedence over thread_id)
 * @param {string} [params.thread_id] - Optional thread ID to determine branch
 * @returns {Promise<Object>} Search results grouped by repository
 */
export async function search_files({
  query,
  repo_path,
  path,
  case_sensitive = false,
  branch_name,
  thread_id
}) {
  if (!query || query.trim() === '') {
    throw new Error('Search query cannot be empty')
  }

  log(
    `search_files: Searching for "${query}" in repo ${repo_path || 'all repos'}`
  )

  const { branch_name: target_branch_name } = await get_target_branch({
    branch_name,
    thread_id,
    repo_path
  })

  // Perform the search
  const results = await search_repository({
    repo_path,
    query,
    git_ref: target_branch_name,
    path,
    case_sensitive
  })

  return {
    repository: repo_path,
    branch: target_branch_name,
    query,
    results
  }
}

// Default export for convenient importing
export default {
  search_files
}
