/**
 * Update a GitHub issue using REST API
 * @param {Object} params - Parameters for updating the issue
 * @param {string} params.github_repository_owner - Repository owner
 * @param {string} params.github_repository_name - Repository name
 * @param {string|number} params.github_issue_number - Issue number
 * @param {string} params.github_token - GitHub API token
 * @param {Object} params.data - Update data (title, body, state, etc.)
 * @returns {Promise<Object>} Updated issue data
 */
export const update_github_issue = async ({
  github_repository_owner,
  github_repository_name,
  github_issue_number,
  github_token,
  data
}) => {
  const url = `https://api.github.com/repos/${github_repository_owner}/${github_repository_name}/issues/${github_issue_number}`

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `Bearer ${github_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`GitHub API error: ${error.message}`)
  }

  return response.json()
}
