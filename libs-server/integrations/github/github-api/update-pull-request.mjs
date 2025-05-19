import fetch from 'node-fetch'
import debug from 'debug'

const log = debug('github')

/**
 * Update an existing pull request on GitHub
 * @param {Object} params - Parameters for updating the pull request
 * @param {string} params.repo - Repository in owner/repo format
 * @param {number} params.pull_number - The number of the pull request
 * @param {string} [params.title] - New title for the pull request
 * @param {string} [params.body] - New body for the pull request
 * @param {string} [params.state] - State of the pull request: open, closed
 * @param {string} params.github_token - GitHub API token
 * @returns {Promise<Object>} Updated pull request data
 */
export async function update_pull_request({
  repo,
  pull_number,
  title,
  body,
  state,
  github_token
}) {
  const [github_repository_owner, github_repository_name] = repo.split('/')

  if (!github_repository_owner || !github_repository_name) {
    throw new Error('Repository must be in the format owner/repo')
  }

  log(`Updating PR #${pull_number} in ${repo}`)

  const url = `https://api.github.com/repos/${github_repository_owner}/${github_repository_name}/pulls/${pull_number}`

  const data = {}
  if (title !== undefined) data.title = title
  if (body !== undefined) data.body = body
  if (state !== undefined) data.state = state

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
    throw new Error(
      `GitHub API error updating PR: ${error.status} - ${error.message}`
    )
  }

  return response.json()
}
