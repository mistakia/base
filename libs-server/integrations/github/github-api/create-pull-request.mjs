import fetch from 'node-fetch'
import debug from 'debug'

const log = debug('github')

/**
 * Create a new pull request on GitHub
 * @param {Object} params - Parameters for creating the pull request
 * @param {string} params.repo - Repository in owner/repo format
 * @param {string} params.title - Title of the pull request
 * @param {string} params.head - The name of the branch where changes are implemented
 * @param {string} params.base - The name of the branch you want the changes pulled into
 * @param {string} params.body - The contents of the pull request
 * @param {string} params.github_token - GitHub API token
 * @returns {Promise<Object>} Pull request data including number and html_url
 */
export async function create_pull_request({
  repo,
  title,
  head,
  base,
  body,
  github_token
}) {
  const [github_repository_owner, github_repository_name] = repo.split('/')

  if (!github_repository_owner || !github_repository_name) {
    throw new Error('Repository must be in the format owner/repo')
  }

  log(`Creating PR in ${repo}: ${title} (${head} → ${base})`)

  const url = `https://api.github.com/repos/${github_repository_owner}/${github_repository_name}/pulls`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `Bearer ${github_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title,
      head,
      base,
      body,
      draft: false
    })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`GitHub API error creating PR: ${error.message}`)
  }

  return response.json()
}
