import debug from 'debug'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import { activity_exists_in_filesystem } from './activity-exists-in-filesystem.mjs'
import { resolve_activity_path } from '../constants.mjs'

const log = debug('activity:read-from-filesystem')

/**
 * Get the contents of an activity file from the filesystem
 *
 * @param {Object} params - Parameters
 * @param {string} params.activity_id - Activity ID in format [system|user]/<file_path>.md
 * @param {string} [params.system_base_directory] - Custom system base directory
 * @param {string} [params.user_base_directory] - Custom user base directory
 * @returns {Promise<Object>} - Activity file contents and metadata
 */
export async function read_activity_from_filesystem({
  activity_id,
  system_base_directory,
  user_base_directory
}) {
  try {
    log(`Reading activity file from filesystem: ${activity_id}`)

    // Check if activity exists
    const activity_file_exists = await activity_exists_in_filesystem({
      activity_id,
      system_base_directory,
      user_base_directory
    })

    if (!activity_file_exists) {
      return {
        success: false,
        error: `Activity '${activity_id}' does not exist`,
        activity_id
      }
    }

    // Get the file path using the shared helper
    const { file_path } = resolve_activity_path({
      activity_id,
      system_base_directory,
      user_base_directory
    })

    log(`Reading activity entity from path: ${file_path}`)

    // Use the entity reader to get the file contents
    const entity_result = await read_entity_from_filesystem({
      absolute_path: file_path
    })

    if (!entity_result.success) {
      return {
        success: false,
        error:
          entity_result.error || `Failed to read activity '${activity_id}'`,
        activity_id,
        file_path
      }
    }

    // Return activity with metadata
    return {
      success: true,
      activity_id,
      file_path,
      entity_properties: entity_result.entity_properties,
      entity_content: entity_result.entity_content,
      raw_content: entity_result.raw_content
    }
  } catch (error) {
    log(`Error reading activity file: ${error.message}`)
    return {
      success: false,
      error: `Failed to read activity file: ${error.message}`,
      activity_id
    }
  }
}
