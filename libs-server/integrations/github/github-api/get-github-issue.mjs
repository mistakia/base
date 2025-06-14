import { gql } from 'graphql-request'
import debug from 'debug'
import { create_github_client } from './create-github-client.mjs'

const log = debug('github')

/**
 * Get a specific GitHub issue using GraphQL
 * @param {Object} params - Parameters for getting the issue
 * @param {string} params.github_repository_owner - Repository owner
 * @param {string} params.github_repository_name - Repository name
 * @param {string|number} params.issue_number - Issue number
 * @param {string} params.github_token - GitHub API token
 * @returns {Promise<Object>} Issue data
 */
export const get_github_issue = async ({
  github_repository_owner,
  github_repository_name,
  issue_number,
  github_token
}) => {
  log(
    `Getting GitHub issue ${github_repository_owner}/${github_repository_name}#${issue_number}`
  )

  const query = gql`
    query GetIssue(
      $owner: String!
      $name: String!
      $number: Int!
    ) {
      repository(owner: $owner, name: $name) {
        issue(number: $number) {
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
          parent {
            id
            number
            title
            repository {
              name
              owner { login }
            }
          }
          subIssues(first: 20) {
            nodes {
              id
              number
              title
              repository {
                name
                owner { login }
              }
            }
          }
          timelineItems(first: 50, itemTypes: [CROSS_REFERENCED_EVENT]) {
            nodes {
              ... on CrossReferencedEvent {
                id
                createdAt
                source {
                  ... on Issue {
                    id
                    number
                    title
                    repository {
                      name
                      owner { login }
                    }
                  }
                }
                target {
                  ... on Issue {
                    id
                    number  
                    title
                    repository {
                      name
                      owner { login }
                    }
                  }
                }
              }
            }
          }
          labels(first: 20) {
            nodes {
              id
              name
              color
            }
          }
          comments(first: 50) {
            nodes {
              id
              author {
                login
              }
              body
              bodyText
              createdAt
              url
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
          repository {
            name
            owner {
              login
            }
          }
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

    return { data }
  } catch (error) {
    log(`GitHub GraphQL API error: ${error.message}`)
    throw error
  }
}
