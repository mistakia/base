import { gql } from 'graphql-request'
import debug from 'debug'
import { create_github_client } from './create-github-client.mjs'

const log = debug('github')

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
