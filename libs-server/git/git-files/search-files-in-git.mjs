import debug from 'debug'
import { branch_exists } from '#libs-server/git/branch-operations.mjs'
import { search_repository } from '#libs-server/git/search-operations.mjs'

const log = debug('libs-server:git:search-files-in-git')

/**
 * Search for content in files within a git repository
 * @param {Object} params - The parameters object
 * @param {string} params.repo_path - The path to the git repository
 * @param {string} params.query - The text to search for
 * @param {string} params.branch - The branch to search in
 * @param {string} [params.path] - Optional path within repo to limit search
 * @param {boolean} [params.case_sensitive=false] - Whether search is case sensitive
 * @returns {Promise<Object>} - Returns an object with success status and search results
 */
export async function search_files_in_git({
  repo_path,
  query,
  branch,
  path,
  case_sensitive = false
}) {
  if (!repo_path) {
    throw new Error('Repository path is required')
  }

  if (!query || query.trim() === '') {
    throw new Error('Search query cannot be empty')
  }

  if (!branch) {
    throw new Error('Branch is required')
  }

  try {
    log(
      `Searching for "${query}" in branch ${branch} at ${repo_path}${path ? ` with path filter ${path}` : ''}`
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

    // Perform the search using the search_repository function
    const results = await search_repository({
      repo_path,
      query,
      git_ref: branch,
      path,
      case_sensitive
    })

    log(`Search completed, found ${results.length} matches`)

    return {
      success: true,
      results,
      branch,
      query
    }
  } catch (error) {
    log(`Error searching files for "${query}":`, error)
    return {
      success: false,
      error: error.message,
      query
    }
  }
}
