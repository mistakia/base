import fetch from 'node-fetch'

/**
 * Get a specific GitHub issue
 * @param {Object} params - Parameters for getting the issue
 * @param {string} params.github_repository_owner - Repository owner
 * @param {string} params.github_repository_name - Repository name
 * @param {string|number} params.issue_number - Issue number
 * @param {string} params.github_token - GitHub API token
 * @returns {Promise<Object>} Issue data
 */
export const get_github_issue = async ({
  github_repository_owner,
  github_repository_name,
  issue_number,
  github_token
}) => {
  const url = `https://api.github.com/repos/${github_repository_owner}/${github_repository_name}/issues/${issue_number}`

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

  return response.json()
}
