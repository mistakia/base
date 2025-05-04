import debug from 'debug'
import { read_entity_from_git } from '#libs-server/entity/git/read-entity-from-git.mjs'
import { activity_exists_in_git } from './activity-exists-in-git.mjs'
import { resolve_activity_path } from '../constants.mjs'

const log = debug('activity:read-from-git')

/**
 * Get the contents of an activity file from a git branch
 *
 * @param {Object} params - Parameters
 * @param {string} params.activity_id - Activity ID in format [system|user]/<file_path>.md
 * @param {string} params.branch - Git branch to read from
 * @param {string} [params.system_base_directory] - Custom system base directory
 * @param {string} [params.user_base_directory] - Custom user base directory
 * @returns {Promise<Object>} - Activity file contents and metadata
 */
export async function read_activity_from_git({
  activity_id,
  branch,
  system_base_directory,
  user_base_directory
}) {
  try {
    log(`Reading activity file from git: ${activity_id} (branch: ${branch})`)

    if (!activity_id) {
      return {
        success: false,
        error: 'Activity ID is required',
        activity_id,
        branch
      }
    }

    if (!branch) {
      return {
        success: false,
        error: 'Branch name is required',
        activity_id
      }
    }

    // Check if activity exists in git
    const activity_exists_result = await activity_exists_in_git({
      activity_id,
      branch,
      system_base_directory,
      user_base_directory
    })

    if (!activity_exists_result.success) {
      return {
        success: false,
        error:
          activity_exists_result.error ||
          'Failed to check if activity exists in git',
        activity_id,
        branch
      }
    }

    if (!activity_exists_result.exists) {
      return {
        success: false,
        error: `Activity '${activity_id}' does not exist in branch '${branch}'`,
        activity_id,
        branch
      }
    }

    // Use the shared path resolution helper to get path components
    const { base_directory, base_relative_path } = resolve_activity_path({
      activity_id,
      system_base_directory,
      user_base_directory
    })

    log(
      `Reading activity from git at path: ${base_relative_path} in repo: ${base_directory}`
    )

    // Use the entity reader to get the file contents from git
    const entity_result = await read_entity_from_git({
      repo_path: base_directory,
      file_path: base_relative_path,
      branch
    })

    if (!entity_result.success) {
      return {
        success: false,
        error:
          entity_result.error || `Failed to read activity '${activity_id}'`,
        activity_id,
        branch
      }
    }

    // Return activity with metadata
    return {
      success: true,
      activity_id,
      branch,
      entity_properties: entity_result.entity_properties,
      entity_content: entity_result.entity_content,
      raw_content: entity_result.raw_content
    }
  } catch (error) {
    log(`Error reading activity file from git: ${error.message}`)
    return {
      success: false,
      error: `Failed to read activity file from git: ${error.message}`,
      activity_id,
      branch
    }
  }
}
