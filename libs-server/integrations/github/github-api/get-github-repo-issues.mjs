import fetch from 'node-fetch'

/**
 * Get issues from a GitHub repository
 * @param {Object} params - Parameters for getting repository issues
 * @param {string} params.github_repository_owner - Repository owner
 * @param {string} params.github_repository_name - Repository name
 * @param {string} params.github_token - GitHub API token
 * @param {string} [params.state='all'] - Issue state filter
 * @param {number} [params.per_page=100] - Results per page
 * @param {number} [params.page=1] - Page number
 * @returns {Promise<Object>} Issue data with pagination info
 */
export const get_github_repo_issues = async ({
  github_repository_owner,
  github_repository_name,
  github_token,
  state = 'all',
  per_page = 100,
  page = 1
}) => {
  const url = `https://api.github.com/repos/${github_repository_owner}/${github_repository_name}/issues?state=${state}&per_page=${per_page}&page=${page}`

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `Bearer ${github_token}`
    }
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`GitHub API error: ${error.status} - ${error.message}`)
  }

  const issues = await response.json()

  // Check if there are more pages
  const link_header = response.headers.get('link')
  const has_next_page =
    link_header && link_header !== '' && link_header.includes('rel="next"')

  return {
    issues,
    has_next_page,
    next_page: has_next_page ? page + 1 : null
  }
}
