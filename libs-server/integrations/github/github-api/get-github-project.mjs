import { gql } from 'graphql-request'
import debug from 'debug'
import { create_github_client } from './create-github-client.mjs'

const log = debug('github')

/**
 * Get GitHub project data using GraphQL
 * @param {Object} params - Parameters for getting GitHub project
 * @param {string} params.username - GitHub username
 * @param {number} params.github_project_number - GitHub project number
 * @param {string} params.github_token - GitHub API token
 * @param {string|null} params.cursor - Pagination cursor
 * @returns {Promise<Object>} Project data
 */
export const get_github_project = async ({
  username,
  github_project_number,
  github_token,
  cursor = null
}) => {
  log(
    `Getting GitHub project ${username}/${github_project_number}${cursor ? ' (with cursor)' : ''}`
  )

  const query = gql`
    query GetProject(
      $username: String!
      $github_project_number: Int!
      $after_cursor: String
    ) {
      user(login: $username) {
        projectV2(number: $github_project_number) {
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
    github_project_number,
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
