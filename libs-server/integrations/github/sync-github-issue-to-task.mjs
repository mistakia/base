import debug from 'debug'
import fs from 'fs'
import {
  create_task_from_github_issue,
  update_task_from_github_issue,
  find_entity_for_github_issue
} from './task/index.mjs'
import { normalize_github_issue } from './normalize-github-issue.mjs'
import { create_content_identifier } from '#libs-server/utils/create-content-identifier.mjs'
import { format_external_id } from '#libs-server/sync/format-external-id.mjs'
import { resolve_base_uri } from '#libs-server/base-uri/base-uri-utilities.mjs'

const log = debug('github:sync-github-issue-to-task')

/**
 * Format external ID specifically for GitHub issues
 *
 * @param {object} params - Parameters
 * @param {string} params.github_repository_owner - GitHub repository owner
 * @param {string} params.github_repository_name - GitHub repository name
 * @param {string} params.github_issue_number - GitHub issue number
 * @returns {string} Formatted external ID for GitHub issue
 */
export function format_external_id_for_github_issue({
  github_repository_owner,
  github_repository_name,
  github_issue_number
}) {
  const external_system = 'github'
  const external_item_id = `${github_repository_owner}/${github_repository_name}:${github_issue_number}`

  return format_external_id({
    external_system,
    external_item_id
  })
}

/**
 * Validate and filter relations by checking if target entities exist
 * @param {Array} relations - Array of relation strings
 * @param {string} user_base_directory - Base directory for user data
 * @returns {Array} Filtered array of relations where targets exist
 */
function validate_and_filter_relations(relations, user_base_directory) {
  if (!relations || !Array.isArray(relations)) {
    return []
  }

  const valid_relations = []

  for (const relation of relations) {
    try {
      // Extract base_uri from relation string format: "relation_type [[base_uri]]"
      const match = relation.match(/\[\[([^\]]+)\]\]/)
      if (!match) {
        log(`Skipping invalid relation format: ${relation}`)
        continue
      }

      const target_base_uri = match[1]

      // Convert base_uri to absolute path
      const target_absolute_path = resolve_base_uri(target_base_uri, {
        user_base_directory
      })

      // Check if target file exists
      if (fs.existsSync(target_absolute_path)) {
        valid_relations.push(relation)
        log(`Validated relation: ${relation}`)
      } else {
        log(`Skipping relation - target does not exist: ${target_base_uri}`)
      }
    } catch (error) {
      log(`Error validating relation "${relation}": ${error.message}`)
    }
  }

  return valid_relations
}

/**
 * Main entry point to sync GitHub issues to tasks
 * Handles transaction management and orchestrates the sync process
 *
 * @param {Object} options - Function options
 * @param {Object} options.github_issue - The GitHub issue data
 * @param {Object} options.github_project_item - The GitHub project item data
 * @param {string} options.github_repository_owner - Repository owner
 * @param {string} options.github_repository_name - Repository name
 * @param {string} options.user_base_directory - Base directory for user data
 * @param {string} options.user_public_key - User public key for task ownership
 * @param {string} [options.import_history_base_directory] - Base directory for import history
 * @param {string} options.github_token - GitHub token
 * @param {string} [options.github_project_number] - GitHub project number
 * @param {boolean} [options.force=false] - Force update all tasks regardless of content
 * @param {Array} [options.comments=[]] - GitHub issue comments
 * @returns {Promise<Object>} - The sync result
 */
export async function sync_github_issue_to_task({
  github_issue,
  github_project_item,
  github_repository_owner,
  github_repository_name,
  user_base_directory,
  user_public_key,
  import_history_base_directory = null,
  github_token,
  github_project_number = null,
  force = false,
  comments = []
}) {
  try {
    log(`Syncing GitHub issue #${github_issue.number} to task`)

    // Validate required parameters
    if (!github_issue) {
      throw new Error('Missing required parameter: github_issue')
    }
    if (!github_repository_owner) {
      throw new Error('Missing required parameter: github_repository_owner')
    }
    if (!github_repository_name) {
      throw new Error('Missing required parameter: github_repository_name')
    }
    if (!user_base_directory) {
      throw new Error('Missing required parameter: user_base_directory')
    }
    if (!user_public_key) {
      throw new Error('Missing required parameter: user_public_key')
    }

    // Create external ID
    const external_id = format_external_id_for_github_issue({
      github_repository_owner,
      github_repository_name,
      github_issue_number: github_issue.number
    })

    // Normalize the GitHub issue data
    const normalized_github_issue = normalize_github_issue({
      issue: github_issue,
      external_id,
      github_repository_owner,
      github_repository_name,
      project_item: github_project_item,
      user_public_key,
      comments
    })

    // Add github_project_number if provided
    if (github_project_number) {
      normalized_github_issue.github_project_number = github_project_number
    }

    // Validate and filter relations - only include relations where target entities exist
    if (normalized_github_issue.relations) {
      normalized_github_issue.relations = validate_and_filter_relations(
        normalized_github_issue.relations,
        user_base_directory
      )
    }

    log('Using normalized GitHub issue format')

    // Calculate import content identifier
    const import_cid = await create_content_identifier(normalized_github_issue)

    // Find if the task already exists
    const existing_task = await find_entity_for_github_issue({
      external_id,
      github_issue_number: github_issue.number,
      github_repository_owner,
      github_repository_name,
      github_issue_title: github_issue.title,
      user_base_directory
    })

    let result

    if (!existing_task) {
      // Create new task if it doesn't exist
      result = await create_task_from_github_issue({
        github_issue,
        normalized_github_issue,
        github_repository_owner,
        github_repository_name,
        user_base_directory,
        user_public_key,
        external_id,
        import_cid,
        import_history_base_directory,
        github_project_number,
        comments
      })

      return {
        action: 'created',
        entity_id: result.entity_id,
        absolute_path: result.absolute_path
      }
    } else {
      // Update existing task
      result = await update_task_from_github_issue({
        github_issue,
        normalized_github_issue,
        github_repository_owner,
        github_repository_name,
        external_id,
        absolute_path: existing_task.absolute_path,
        user_base_directory,
        import_cid,
        import_history_base_directory,
        github_token,
        github_project_number,
        force,
        comments
      })

      return result
    }
  } catch (error) {
    log(`Error syncing GitHub issue to task: ${error.message}`)

    throw error
  }
}
