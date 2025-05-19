import { gql } from 'graphql-request'
import debug from 'debug'
import { create_github_client } from './create-github-client.mjs'

const log = debug('github')

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
