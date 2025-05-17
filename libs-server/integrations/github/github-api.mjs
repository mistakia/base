import fetch from 'node-fetch'
import debug from 'debug'
import { GraphQLClient, gql } from 'graphql-request'

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

const create_github_client = ({ github_token }) => {
  return new GraphQLClient('https://api.github.com/graphql', {
    headers: {
      Authorization: `Bearer ${github_token}`
    }
  })
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

  const query = gql`
    query GetProject(
      $username: String!
      $project_number: Int!
      $after_cursor: String
    ) {
      user(login: $username) {
        projectV2(number: $project_number) {
          id
          items(first: 100, after: $after_cursor) {
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
    }
  `

  const variables = {
    username,
    project_number,
    after_cursor: cursor
  }

  try {
    const client = create_github_client({ github_token })
    const data = await client.request(query, variables)

    return { data }
  } catch (error) {
    log(`GitHub GraphQL API error: ${error.message}`)
    throw error
  }
}

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
    const github_repository_owner = issue.repository.owner.login
    const github_repository_name = issue.repository.name
    const issue_number = issue.number
    const repo_full_name = `${github_repository_owner}/${github_repository_name}`

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
        name: github_repository_name,
        owner: {
          login: github_repository_owner
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
    const github_repository_owner = issue.repository.owner.login
    const github_repository_name = issue.repository.name
    const repo_full_name = `${github_repository_owner}/${github_repository_name}`

    if (!issues_by_repo[repo_full_name]) {
      issues_by_repo[repo_full_name] = {
        github_repository_owner,
        github_repository_name,
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
