import debug from 'debug'
import {
  read_entity_from_filesystem,
  write_entity_to_filesystem
} from '#libs-server/entity/filesystem/index.mjs'
import { generate_labels_from_tags } from './github-entity-mapper.mjs'
import { format_external_id_for_github_issue } from './sync-github-issue-to-task.mjs'

const log = debug('github:create-github-issue-from-task')

/**
 * Creates a GitHub issue from a local task file that has repository metadata
 * Updates the task file with the new external_id and GitHub metadata
 *
 * @param {Object} options - Function options
 * @param {string} options.absolute_path - Absolute path to the task file
 * @param {string} options.github_token - GitHub token for API calls
 * @param {Function} options.create_github_issue_api - GitHub API function to create issues
 * @returns {Promise<Object>} - Result with GitHub issue data and updated task
 */
export async function create_github_issue_from_task({
  absolute_path,
  github_token,
  create_github_issue_api
}) {
  try {
    log(`Creating GitHub issue from task at ${absolute_path}`)

    // Read the existing task
    const { entity_properties, entity_content } =
      await read_entity_from_filesystem({
        absolute_path
      })

    // Validate the task has required GitHub metadata
    if (!entity_properties.github_repository_owner) {
      throw new Error(
        `Task at ${absolute_path} missing github_repository_owner - cannot create GitHub issue`
      )
    }

    if (!entity_properties.github_repository_name) {
      throw new Error(
        `Task at ${absolute_path} missing github_repository_name - cannot create GitHub issue`
      )
    }

    // Check if task already has an external_id
    if (entity_properties.external_id) {
      throw new Error(
        `Task at ${absolute_path} already has external_id - GitHub issue may already exist`
      )
    }

    // Prepare GitHub issue data
    const github_issue_data = {
      title: entity_properties.title,
      body:
        entity_properties.description ||
        entity_content ||
        'No description provided',
      labels: entity_properties.tags
        ? generate_labels_from_tags(entity_properties.tags)
        : []
    }

    // Create the GitHub issue
    log(
      `Creating GitHub issue for repository ${entity_properties.github_repository_owner}/${entity_properties.github_repository_name}`
    )
    const github_issue = await create_github_issue_api({
      github_repository_owner: entity_properties.github_repository_owner,
      github_repository_name: entity_properties.github_repository_name,
      data: github_issue_data,
      github_token
    })

    // Generate external_id for the new issue
    const external_id = format_external_id_for_github_issue({
      github_repository_owner: entity_properties.github_repository_owner,
      github_repository_name: entity_properties.github_repository_name,
      github_issue_number: github_issue.number
    })

    // Update task with GitHub metadata
    const updated_entity_properties = {
      ...entity_properties,
      external_id,
      external_url: github_issue.html_url,
      github_id: github_issue.id,
      github_number: github_issue.number,
      github_url: github_issue.html_url,
      updated_at: new Date().toISOString()
    }

    // Write the updated task back to filesystem
    await write_entity_to_filesystem({
      absolute_path,
      entity_properties: updated_entity_properties,
      entity_type: 'task',
      entity_content
    })

    log(
      `Successfully created GitHub issue #${github_issue.number} and updated task`
    )

    return {
      success: true,
      github_issue,
      external_id,
      absolute_path,
      entity_id: entity_properties.entity_id
    }
  } catch (error) {
    log(`Error creating GitHub issue from task: ${error.message}`)
    throw error
  }
}
