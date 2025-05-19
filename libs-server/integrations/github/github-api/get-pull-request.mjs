import fetch from 'node-fetch'
import debug from 'debug'

const log = debug('github')

/**
 * Get a specific pull request from GitHub
 * @param {Object} params - Parameters for fetching the pull request
 * @param {string} params.repo - Repository in owner/repo format
 * @param {number} params.pull_number - The number of the pull request
 * @param {string} params.github_token - GitHub API token
 * @returns {Promise<Object>} Pull request data
 */
export async function get_pull_request({ repo, pull_number, github_token }) {
  const [github_repository_owner, github_repository_name] = repo.split('/')

  if (!github_repository_owner || !github_repository_name) {
    throw new Error('Repository must be in the format owner/repo')
  }

  log(`Getting PR #${pull_number} from ${repo}`)

  const url = `https://api.github.com/repos/${github_repository_owner}/${github_repository_name}/pulls/${pull_number}`

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `Bearer ${github_token}`
    }
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`GitHub API error fetching PR: ${error.message}`)
  }

  return response.json()
}
