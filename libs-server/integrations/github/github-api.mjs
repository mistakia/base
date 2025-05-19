import fetch from 'node-fetch'
import debug from 'debug'
import { GraphQLClient, gql } from 'graphql-request'
import { TASK_STATUS } from '#libs-shared/task-constants.mjs'

const log = debug('github')

// set the github state based on the task status
export const map_task_status_to_github_state = (status) => {
  switch (status) {
    case TASK_STATUS.COMPLETED:
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

  console.log({
    url,
    data
  })

  process.exit(0)

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

/**
 * Update GitHub issue using GraphQL API
 * @param {Object} params - Parameters for updating the issue
 * @param {string} params.github_repository_owner - Repository owner
 * @param {string} params.github_repository_name - Repository name
 * @param {string|number} params.github_issue_number - Issue number
 * @param {string} params.github_token - GitHub token
 * @param {Object} params.data - Update data (title, body, state)
 * @returns {Promise<Object>} Updated issue data
 */
export async function update_github_issue_graphql({
  github_repository_owner,
  github_repository_name,
  github_issue_number,
  github_token,
  data
}) {
  log(
    `Updating GitHub issue ${github_repository_owner}/${github_repository_name}#${github_issue_number} via GraphQL`
  )

  const client = create_github_client({ github_token })

  // Get the issue node ID first (required for GraphQL mutations)
  const get_issue_id_query = gql`
    query GetIssueId($owner: String!, $name: String!, $number: Int!) {
      repository(owner: $owner, name: $name) {
        issue(number: $number) {
          id
        }
      }
    }
  `

  const variables = {
    owner: github_repository_owner,
    name: github_repository_name,
    number: parseInt(github_issue_number, 10)
  }

  try {
    // Get the issue ID
    const issue_data = await client.request(get_issue_id_query, variables)
    const issue_id = issue_data.repository.issue.id

    // Build mutations based on what fields are being updated
    const mutation = gql`
      mutation UpdateIssue($input: UpdateIssueInput!) {
        updateIssue(input: $input) {
          issue {
            id
            number
            title
            body
            state
            url
          }
        }
      }
    `

    const mutation_input = {
      id: issue_id
    }

    // Map fields from our data object to GraphQL input
    if (data.title !== undefined) {
      mutation_input.title = data.title
    }

    if (data.body !== undefined) {
      mutation_input.body = data.body
    }

    // Handle state changes
    if (data.state !== undefined) {
      if (data.state === 'closed') {
        mutation_input.state = 'CLOSED'
      } else if (data.state === 'open') {
        mutation_input.state = 'OPEN'
      }
    }

    // Execute the mutation
    const result = await client.request(mutation, { input: mutation_input })
    return result.updateIssue.issue
  } catch (error) {
    log(`GitHub GraphQL API error: ${error.message}`)
    throw error
  }
}

/**
 * Update GitHub project item fields via GraphQL API
 * @param {Object} params - Parameters for updating the project item
 * @param {string} params.project_id - Project ID (GraphQL node ID)
 * @param {string} params.item_id - Project item ID (GraphQL node ID)
 * @param {Object} params.field_updates - Map of field IDs to their new values
 * @param {string} params.github_token - GitHub token
 * @returns {Promise<Object>} Update result
 */
export async function update_github_project_item({
  project_id,
  item_id,
  field_updates,
  github_token
}) {
  log('Updating GitHub project item via GraphQL')

  const client = create_github_client({ github_token })
  const results = {}

  // Process each field update independently
  for (const [field_id, value] of Object.entries(field_updates)) {
    try {
      if (typeof value === 'string') {
        // Handle text field updates
        const text_field_mutation = gql`
          mutation UpdateProjectItemField(
            $input: UpdateProjectV2ItemFieldValueInput!
          ) {
            updateProjectV2ItemFieldValue(input: $input) {
              projectV2Item {
                id
              }
            }
          }
        `

        const text_input = {
          projectId: project_id,
          itemId: item_id,
          fieldId: field_id,
          value: {
            text: value
          }
        }

        results[field_id] = await client.request(text_field_mutation, {
          input: text_input
        })
      } else if (typeof value === 'boolean' || value === null) {
        // Handle checkbox/boolean fields
        const checkbox_mutation = gql`
          mutation UpdateProjectItemField(
            $input: UpdateProjectV2ItemFieldValueInput!
          ) {
            updateProjectV2ItemFieldValue(input: $input) {
              projectV2Item {
                id
              }
            }
          }
        `

        const checkbox_input = {
          projectId: project_id,
          itemId: item_id,
          fieldId: field_id,
          value: {
            boolean: value
          }
        }

        results[field_id] = await client.request(checkbox_mutation, {
          input: checkbox_input
        })
      } else if (typeof value === 'object' && value !== null) {
        if (value.singleSelectOptionId) {
          // Handle single select field updates
          const select_mutation = gql`
            mutation UpdateProjectItemField(
              $input: UpdateProjectV2ItemFieldValueInput!
            ) {
              updateProjectV2ItemFieldValue(input: $input) {
                projectV2Item {
                  id
                }
              }
            }
          `

          const select_input = {
            projectId: project_id,
            itemId: item_id,
            fieldId: field_id,
            value: {
              singleSelectOptionId: value.singleSelectOptionId
            }
          }

          results[field_id] = await client.request(select_mutation, {
            input: select_input
          })
        } else if (value.date) {
          // Handle date field updates
          const date_mutation = gql`
            mutation UpdateProjectItemField(
              $input: UpdateProjectV2ItemFieldValueInput!
            ) {
              updateProjectV2ItemFieldValue(input: $input) {
                projectV2Item {
                  id
                }
              }
            }
          `

          const date_input = {
            projectId: project_id,
            itemId: item_id,
            fieldId: field_id,
            value: {
              date: value.date
            }
          }

          results[field_id] = await client.request(date_mutation, {
            input: date_input
          })
        }
      }
    } catch (error) {
      log(
        `GitHub GraphQL API error updating project item field ${field_id}: ${error.message}`
      )
      results[field_id] = { error: error.message }
    }
  }

  return results
}

/**
 * Get GitHub project item information via GraphQL
 * @param {Object} params - Parameters for getting project item info
 * @param {string} params.github_repository_owner - Repository owner
 * @param {string} params.github_repository_name - Repository name
 * @param {string|number} params.github_issue_number - Issue number
 * @param {string|number} params.project_number - Project number
 * @param {string} params.github_token - GitHub token
 * @returns {Promise<Object>} Project item data including ID and fields
 */
export async function get_github_project_item_for_issue({
  github_repository_owner,
  github_repository_name,
  github_issue_number,
  project_number,
  github_token
}) {
  log(
    `Getting GitHub project item for issue ${github_repository_owner}/${github_repository_name}#${github_issue_number}`
  )

  const client = create_github_client({ github_token })

  const query = gql`
    query GetProjectItem(
      $owner: String!
      $repo: String!
      $issue_number: Int!
      $project_number: Int!
    ) {
      repository(owner: $owner, name: $repo) {
        issue(number: $issue_number) {
          id
          projectItems(first: 10) {
            nodes {
              id
              project {
                id
                number
                fields(first: 20) {
                  nodes {
                    ... on ProjectV2SingleSelectField {
                      id
                      name
                      options {
                        id
                        name
                      }
                    }
                    ... on ProjectV2Field {
                      id
                      name
                    }
                  }
                }
              }
              fieldValues(first: 20) {
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
                  }
                  ... on ProjectV2ItemFieldDateValue {
                    date
                    field {
                      ... on ProjectV2Field {
                        id
                        name
                      }
                    }
                  }
                  ... on ProjectV2ItemFieldSingleSelectValue {
                    id
                    name
                    field {
                      ... on ProjectV2SingleSelectField {
                        id
                        name
                        options {
                          id
                          name
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `

  const variables = {
    owner: github_repository_owner,
    repo: github_repository_name,
    issue_number: parseInt(github_issue_number, 10),
    project_number: parseInt(project_number, 10)
  }

  try {
    const data = await client.request(query, variables)
    const issue_data = data.repository.issue

    // Find the project item that matches the requested project number
    const project_item = issue_data.projectItems.nodes.find(
      (item) => item.project.number === parseInt(project_number, 10)
    )

    if (!project_item) {
      log(`Issue is not in project #${project_number}`)
      return null
    }

    // Extract field definitions and options, particularly for status fields
    const status_field = project_item.project.fields.nodes.find(
      (field) => field.name && field.name.toLowerCase() === 'status'
    )

    // Process and organize the data to return
    return {
      item_id: project_item.id,
      project_id: project_item.project.id,
      fields: project_item.fieldValues.nodes,
      field_definitions: project_item.project.fields.nodes,
      status_field
    }
  } catch (error) {
    log(`GitHub GraphQL API error: ${error.message}`)
    throw error
  }
}
