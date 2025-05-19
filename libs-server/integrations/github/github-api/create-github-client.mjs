import { GraphQLClient } from 'graphql-request'

/**
 * Creates a GitHub GraphQL client with authentication
 * @param {Object} params - Client parameters
 * @param {string} params.github_token - GitHub API token
 * @returns {GraphQLClient} Configured GraphQL client
 */
export const create_github_client = ({ github_token }) => {
  return new GraphQLClient('https://api.github.com/graphql', {
    headers: {
      Authorization: `Bearer ${github_token}`
    }
  })
}
