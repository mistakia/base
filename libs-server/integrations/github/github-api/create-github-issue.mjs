import debug from 'debug'
import { gql } from 'graphql-request'
import { create_github_client } from './create-github-client.mjs'

const log = debug('github:api:create-github-issue')

/**
 * Creates a new GitHub issue using the GraphQL API
 *
 * @param {Object} options - Function options
 * @param {string} options.github_repository_owner - Repository owner
 * @param {string} options.github_repository_name - Repository name
 * @param {Object} options.data - Issue data
 * @param {string} options.data.title - Issue title
 * @param {string} [options.data.body] - Issue body/description
 * @param {Array} [options.data.labels] - Array of label names
 * @param {Array} [options.data.assignees] - Array of assignee usernames
 * @param {string} options.github_token - GitHub token
 * @returns {Promise<Object>} - Created GitHub issue object
 */
export async function create_github_issue({
  github_repository_owner,
  github_repository_name,
  data,
  github_token
}) {
  try {
    log(
      `Creating GitHub issue in ${github_repository_owner}/${github_repository_name}`
    )

    if (!github_repository_owner) {
      throw new Error('Missing required parameter: github_repository_owner')
    }

    if (!github_repository_name) {
      throw new Error('Missing required parameter: github_repository_name')
    }

    if (!data?.title) {
      throw new Error('Missing required parameter: data.title')
    }

    if (!github_token) {
      throw new Error('Missing required parameter: github_token')
    }

    // Create GitHub GraphQL client
    const client = create_github_client({ github_token })

    // First, get the repository ID
    const repository_query = gql`
      query GetRepository($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
          id
        }
      }
    `

    const repository_result = await client.request(repository_query, {
      owner: github_repository_owner,
      name: github_repository_name
    })

    if (!repository_result.repository) {
      throw new Error(
        `Repository ${github_repository_owner}/${github_repository_name} not found or inaccessible`
      )
    }

    const repository_id = repository_result.repository.id

    // Prepare the mutation input
    const mutation_input = {
      repositoryId: repository_id,
      title: data.title,
      body: data.body || ''
    }

    // Add label IDs if labels are provided
    if (data.labels && data.labels.length > 0) {
      // Get label IDs for the provided label names
      const labels_query = gql`
        query GetLabels($owner: String!, $name: String!, $first: Int!) {
          repository(owner: $owner, name: $name) {
            labels(first: $first) {
              nodes {
                id
                name
              }
            }
          }
        }
      `

      const labels_result = await client.request(labels_query, {
        owner: github_repository_owner,
        name: github_repository_name,
        first: 100 // Should be enough for most repositories
      })

      const available_labels = labels_result.repository?.labels?.nodes || []
      const label_ids = []

      for (const label_name of data.labels) {
        const label = available_labels.find((l) => l.name === label_name)
        if (label) {
          label_ids.push(label.id)
        } else {
          log(`Warning: Label "${label_name}" not found in repository`)
        }
      }

      if (label_ids.length > 0) {
        mutation_input.labelIds = label_ids
      }
    }

    // Add assignee IDs if assignees are provided
    if (data.assignees && data.assignees.length > 0) {
      // Get user IDs for the provided usernames
      const assignee_ids = []

      for (const username of data.assignees) {
        const user_query = gql`
          query GetUser($login: String!) {
            user(login: $login) {
              id
            }
          }
        `

        try {
          const user_result = await client.request(user_query, {
            login: username
          })
          if (user_result.user) {
            assignee_ids.push(user_result.user.id)
          } else {
            log(`Warning: User "${username}" not found`)
          }
        } catch (error) {
          log(`Warning: Could not fetch user "${username}": ${error.message}`)
        }
      }

      if (assignee_ids.length > 0) {
        mutation_input.assigneeIds = assignee_ids
      }
    }

    log(`Creating issue with title: "${mutation_input.title}"`)

    // Create the issue using GraphQL mutation
    const create_issue_mutation = gql`
      mutation CreateIssue($input: CreateIssueInput!) {
        createIssue(input: $input) {
          issue {
            id
            number
            title
            body
            url
            createdAt
            updatedAt
            state
            author {
              login
            }
            labels(first: 10) {
              nodes {
                name
              }
            }
            assignees(first: 10) {
              nodes {
                login
              }
            }
          }
        }
      }
    `

    const create_result = await client.request(create_issue_mutation, {
      input: mutation_input
    })

    const created_issue = create_result.createIssue.issue

    // Transform the GraphQL response to match the expected format
    const formatted_issue = {
      id: created_issue.id,
      number: created_issue.number,
      title: created_issue.title,
      body: created_issue.body,
      html_url: created_issue.url,
      created_at: created_issue.createdAt,
      updated_at: created_issue.updatedAt,
      state: created_issue.state.toLowerCase(),
      user: {
        login: created_issue.author?.login
      },
      labels: created_issue.labels.nodes.map((label) => ({ name: label.name })),
      assignees: created_issue.assignees.nodes.map((assignee) => ({
        login: assignee.login
      }))
    }

    log(
      `Successfully created GitHub issue #${formatted_issue.number}: ${formatted_issue.html_url}`
    )

    return formatted_issue
  } catch (error) {
    log(`Error creating GitHub issue: ${error.message}`)

    // Log additional GraphQL error details if available
    if (error.response) {
      log('GitHub GraphQL error:', error.response.errors)
    }

    throw new Error(`Failed to create GitHub issue: ${error.message}`)
  }
}
