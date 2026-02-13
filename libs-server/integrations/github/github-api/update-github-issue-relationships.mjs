import { gql } from 'graphql-request'
import debug from 'debug'
import { create_github_client } from './create-github-client.mjs'

const log = debug('github:relationships')

/**
 * Convert an issue to a subtask by setting its parent
 * @param {Object} params - Parameters
 * @param {string} params.issue_id - GitHub issue ID (global ID)
 * @param {string} params.parent_issue_id - Parent issue ID (global ID)
 * @param {string} params.github_token - GitHub API token
 * @returns {Promise<Object>} Mutation result
 */
export async function set_github_issue_parent({
  issue_id,
  parent_issue_id,
  github_token
}) {
  log(`Converting issue ${issue_id} to subtask of ${parent_issue_id}`)

  const mutation = gql`
    mutation ConvertIssueToSubIssue($input: ConvertIssueToSubIssueInput!) {
      convertIssueToSubIssue(input: $input) {
        subIssue {
          id
          number
          parent {
            id
            number
          }
        }
        clientMutationId
      }
    }
  `

  const variables = {
    input: {
      issueId: issue_id,
      parentIssueId: parent_issue_id
    }
  }

  try {
    const client = create_github_client({ github_token })
    const data = await client.request(mutation, variables)
    log(
      `Successfully converted issue to subtask: ${data.convertIssueToSubIssue.subIssue.number}`
    )
    return { success: true, data }
  } catch (error) {
    log(`Error converting issue to subtask: ${error.message}`)
    throw error
  }
}

/**
 * Convert a subtask back to an independent issue
 * @param {Object} params - Parameters
 * @param {string} params.issue_id - GitHub issue ID (global ID)
 * @param {string} params.github_token - GitHub API token
 * @returns {Promise<Object>} Mutation result
 */
export async function remove_github_issue_parent({ issue_id, github_token }) {
  log(`Converting subtask ${issue_id} back to independent issue`)

  const mutation = gql`
    mutation ConvertSubIssueToIssue($input: ConvertSubIssueToIssueInput!) {
      convertSubIssueToIssue(input: $input) {
        issue {
          id
          number
        }
        clientMutationId
      }
    }
  `

  const variables = {
    input: {
      subIssueId: issue_id
    }
  }

  try {
    const client = create_github_client({ github_token })
    const data = await client.request(mutation, variables)
    log(
      `Successfully converted subtask to issue: ${data.convertSubIssueToIssue.issue.number}`
    )
    return { success: true, data }
  } catch (error) {
    log(`Error converting subtask to issue: ${error.message}`)
    throw error
  }
}

/**
 * Create a cross-reference between issues by adding a comment
 * @param {Object} params - Parameters
 * @param {string|number} params.source_issue_number - Source issue number
 * @param {string|number} params.target_issue_number - Target issue number
 * @param {string} params.github_repository_owner - Repository owner
 * @param {string} params.github_repository_name - Repository name
 * @param {string} params.github_token - GitHub API token
 * @param {string} [params.comment_text="Related to"] - Optional context text
 * @returns {Promise<Object>} Comment creation result
 */
export async function create_github_issue_cross_reference({
  source_issue_number,
  target_issue_number,
  github_repository_owner,
  github_repository_name,
  github_token,
  comment_text = 'Related to'
}) {
  log(
    `Creating cross-reference from issue #${source_issue_number} to #${target_issue_number}`
  )

  const mutation = gql`
    mutation AddComment($input: AddCommentInput!) {
      addComment(input: $input) {
        commentEdge {
          node {
            id
            body
            createdAt
          }
        }
        clientMutationId
      }
    }
  `

  // First, get the source issue ID
  const issue_query = gql`
    query GetIssue($owner: String!, $name: String!, $number: Int!) {
      repository(owner: $owner, name: $name) {
        issue(number: $number) {
          id
        }
      }
    }
  `

  try {
    const client = create_github_client({ github_token })

    // Get source issue ID
    const issue_data = await client.request(issue_query, {
      owner: github_repository_owner,
      name: github_repository_name,
      number: parseInt(source_issue_number, 10)
    })

    if (!issue_data.repository?.issue?.id) {
      throw new Error(`Could not find issue #${source_issue_number}`)
    }

    const source_issue_id = issue_data.repository.issue.id

    // Create comment with cross-reference
    const comment_body = `${comment_text} #${target_issue_number}`

    const variables = {
      input: {
        subjectId: source_issue_id,
        body: comment_body
      }
    }

    const data = await client.request(mutation, variables)
    log(`Successfully created cross-reference comment: "${comment_body}"`)
    return { success: true, data }
  } catch (error) {
    log(`Error creating cross-reference: ${error.message}`)
    throw error
  }
}

/**
 * Get GitHub issue ID from issue number
 * Helper function to resolve issue numbers to GitHub global IDs
 * @param {Object} params - Parameters
 * @param {string} params.github_repository_owner - Repository owner
 * @param {string} params.github_repository_name - Repository name
 * @param {string|number} params.issue_number - Issue number
 * @param {string} params.github_token - GitHub API token
 * @returns {Promise<string>} GitHub issue global ID
 */
export async function get_github_issue_id({
  github_repository_owner,
  github_repository_name,
  issue_number,
  github_token
}) {
  const query = gql`
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
    number: parseInt(issue_number, 10)
  }

  try {
    const client = create_github_client({ github_token })
    const data = await client.request(query, variables)

    if (!data.repository?.issue?.id) {
      throw new Error(
        `Could not find issue #${issue_number} in ${github_repository_owner}/${github_repository_name}`
      )
    }

    return data.repository.issue.id
  } catch (error) {
    log(`Error getting issue ID: ${error.message}`)
    throw error
  }
}
