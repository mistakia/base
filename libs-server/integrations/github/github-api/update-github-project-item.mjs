import { gql } from 'graphql-request'
import debug from 'debug'
import { create_github_client } from './create-github-client.mjs'

const log = debug('github')

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
