import fetch from 'node-fetch'
import debug from 'debug'

const log = debug('github')

// set the github state based on the task status
export const map_task_status_to_github_state = (status) => {
  switch (status) {
    case 'Completed':
      return 'closed'
    default:
      return 'open'
  }
}

export const get_github_project = async ({
  username,
  project_number,
  github_token,
  cursor = null
}) => {
  log(
    `Getting GitHub project ${username}/${project_number}${cursor ? ' (with cursor)' : ''}`
  )

  const after_cursor = cursor ? `, after: "${cursor}"` : ''
  const query = `
    query {
      user(login: "${username}") {
        projectV2(number: ${project_number}) {
          id
          items(first: 100${after_cursor}) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              fieldValues(first: 100) {
                nodes {
                  ... on ProjectV2ItemFieldTextValue {
                    id
                    text
                    field {
                      ... on ProjectV2Field {
                        id
                        name
                      }
                    }
                    item {
                      id
                      content {
                        ... on PullRequest {
                          id
                          url
                          body
                          bodyHTML
                          bodyText
                          title
                          __typename
                        }
                        ... on Issue {
                          id
                          url
                          body
                          bodyHTML
                          bodyResourcePath
                          bodyText
                          bodyUrl
                          title
                          __typename
                        }
                      }
                    }
                  }
                  ... on ProjectV2ItemFieldDateValue {
                    field {
                      ... on ProjectV2Field {
                        id
                        name
                      }
                    }
                    date
                  }
                  ... on ProjectV2ItemFieldSingleSelectValue {
                    id
                    name
                    field {
                      ... on ProjectV2SingleSelectField {
                        id
                        name
                      }
                    }
                  }
                }
              }
              id
              content {
                ... on Issue {
                  id
                  url
                  number
                  title
                  body
                  bodyText
                  state
                  createdAt
                  updatedAt
                  closedAt
                  labels(first: 20) {
                    nodes {
                      id
                      name
                      color
                    }
                  }
                  repository {
                    name
                    owner {
                      login
                    }
                  }
                  __typename
                }
                ... on PullRequest {
                  id
                  url
                  __typename
                }
              }
            }
          }
        }
      }
    }`

  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${github_token}`
    },
    body: JSON.stringify({ query })
  })
  const data = await response.json()

  return data
}

export const get_github_repo_issues = async ({
  owner,
  repo,
  github_token,
  state = 'all',
  per_page = 100,
  page = 1
}) => {
  const url = `https://api.github.com/repos/${owner}/${repo}/issues?state=${state}&per_page=${per_page}&page=${page}`

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `Bearer ${github_token}`
    }
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`GitHub API error: ${error.message}`)
  }

  const issues = await response.json()

  // Check if there are more pages
  const link_header = response.headers.get('link')
  const has_next_page = link_header && link_header.includes('rel="next"')

  return {
    issues,
    has_next_page,
    next_page: has_next_page ? page + 1 : null
  }
}

export const get_github_issue = async ({
  owner,
  repo,
  issue_number,
  github_token
}) => {
  const url = `https://api.github.com/repos/${owner}/${repo}/issues/${issue_number}`

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `Bearer ${github_token}`
    }
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`GitHub API error: ${error.message}`)
  }

  return response.json()
}

export const update_github_issue = async ({
  owner,
  repo,
  issue_number,
  github_token,
  data
}) => {
  const url = `https://api.github.com/repos/${owner}/${repo}/issues/${issue_number}`

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

// Extract and normalize GitHub issue data from GraphQL response
export const extract_issues_from_project_graphql = (project_data) => {
  const issues = []
  const project_items_by_issue = {}

  if (!project_data?.data?.user?.projectV2?.items?.nodes) {
    return { issues, project_items_by_issue }
  }

  const project_items = project_data.data.user.projectV2.items.nodes

  for (const item of project_items) {
    // Skip items that aren't issues
    if (!item.content || item.content.__typename !== 'Issue') {
      continue
    }

    const issue = item.content
    const owner = issue.repository.owner.login
    const repo = issue.repository.name
    const issue_number = issue.number
    const repo_full_name = `${owner}/${repo}`

    // Convert GraphQL issue format to REST API format for compatibility
    const normalized_issue = {
      id: issue.id,
      number: issue.number,
      title: issue.title,
      body: issue.body || issue.bodyText,
      state: issue.state.toLowerCase(),
      url: issue.url,
      html_url: issue.url,
      created_at: issue.createdAt,
      updated_at: issue.updatedAt,
      closed_at: issue.closedAt,
      labels:
        issue.labels?.nodes?.map((label) => ({
          id: label.id,
          name: label.name,
          color: label.color
        })) || [],
      repository: {
        name: repo,
        owner: {
          login: owner
        }
      }
    }

    issues.push(normalized_issue)

    // Store the mapping from issue to project item for metadata extraction
    if (!project_items_by_issue[repo_full_name]) {
      project_items_by_issue[repo_full_name] = {}
    }

    project_items_by_issue[repo_full_name][issue_number] = item
  }

  return { issues, project_items_by_issue }
}

// Group issues by repository
export const group_issues_by_repo = (issues) => {
  const issues_by_repo = {}

  for (const issue of issues) {
    const owner = issue.repository.owner.login
    const repo = issue.repository.name
    const repo_full_name = `${owner}/${repo}`

    if (!issues_by_repo[repo_full_name]) {
      issues_by_repo[repo_full_name] = {
        owner,
        repo,
        issues: []
      }
    }

    issues_by_repo[repo_full_name].issues.push(issue)
  }

  return issues_by_repo
}

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
  const [owner, repo_name] = repo.split('/')

  if (!owner || !repo_name) {
    throw new Error('Repository must be in the format owner/repo')
  }

  log(`Creating PR in ${repo}: ${title} (${head} → ${base})`)

  const url = `https://api.github.com/repos/${owner}/${repo_name}/pulls`

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

/**
 * Get a specific pull request from GitHub
 * @param {Object} params - Parameters for fetching the pull request
 * @param {string} params.repo - Repository in owner/repo format
 * @param {number} params.pull_number - The number of the pull request
 * @param {string} params.github_token - GitHub API token
 * @returns {Promise<Object>} Pull request data
 */
export async function get_pull_request({ repo, pull_number, github_token }) {
  const [owner, repo_name] = repo.split('/')

  if (!owner || !repo_name) {
    throw new Error('Repository must be in the format owner/repo')
  }

  log(`Getting PR #${pull_number} from ${repo}`)

  const url = `https://api.github.com/repos/${owner}/${repo_name}/pulls/${pull_number}`

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
  const [owner, repo_name] = repo.split('/')

  if (!owner || !repo_name) {
    throw new Error('Repository must be in the format owner/repo')
  }

  log(`Updating PR #${pull_number} in ${repo}`)

  const url = `https://api.github.com/repos/${owner}/${repo_name}/pulls/${pull_number}`

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
    throw new Error(`GitHub API error updating PR: ${error.message}`)
  }

  return response.json()
}
