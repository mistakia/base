import debug from 'debug'

const log = debug('github')

/**
 * Get comments for a specific GitHub issue
 * @param {Object} params - Parameters for getting issue comments
 * @param {string} params.github_repository_owner - Repository owner
 * @param {string} params.github_repository_name - Repository name
 * @param {number} params.issue_number - Issue number
 * @param {string} params.github_token - GitHub API token
 * @param {number} [params.per_page=100] - Results per page
 * @param {number} [params.page=1] - Page number
 * @returns {Promise<Object>} Comments data with pagination info
 */
export const get_github_issue_comments = async ({
  github_repository_owner,
  github_repository_name,
  issue_number,
  github_token,
  per_page = 100,
  page = 1
}) => {
  const url = `https://api.github.com/repos/${github_repository_owner}/${github_repository_name}/issues/${issue_number}/comments?per_page=${per_page}&page=${page}`

  log(`Fetching comments for issue #${issue_number} (page ${page})`)

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

  const comments = await response.json()

  // Check if there are more pages
  const link_header = response.headers.get('link')
  const has_next_page = link_header && link_header.includes('rel="next"')

  log(`Fetched ${comments.length} comments for issue #${issue_number}`)

  return {
    comments,
    has_next_page,
    next_page: has_next_page ? page + 1 : null
  }
}

/**
 * Get all comments for a GitHub issue, handling pagination
 * @param {Object} params - Parameters for getting all issue comments
 * @param {string} params.github_repository_owner - Repository owner
 * @param {string} params.github_repository_name - Repository name
 * @param {number} params.issue_number - Issue number
 * @param {string} params.github_token - GitHub API token
 * @returns {Promise<Array>} All comments for the issue
 */
export const get_all_github_issue_comments = async ({
  github_repository_owner,
  github_repository_name,
  issue_number,
  github_token
}) => {
  let page = 1
  let has_next_page = true
  let all_comments = []

  while (has_next_page) {
    const {
      comments,
      has_next_page: more_pages,
      next_page
    } = await get_github_issue_comments({
      github_repository_owner,
      github_repository_name,
      issue_number,
      github_token,
      page
    })

    all_comments = all_comments.concat(comments)
    has_next_page = more_pages
    page = next_page
  }

  return all_comments
}
