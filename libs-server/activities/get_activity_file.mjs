import fs from 'fs/promises'
import debug from 'debug'
import activity_exists from './activity_exists.mjs'
import { resolve_activity_path } from './constants.mjs'

const log = debug('activities:get')

/**
 * Get the contents of an activity file
 *
 * @param {Object} params - Parameters
 * @param {string} params.activity_id - Activity ID in format [system|user]/<file_path>.md (e.g., system/create_activity.md)
 * @param {string} [params.system_base_directory] - Custom system base directory
 * @param {string} [params.user_base_directory] - Custom user base directory
 * @returns {Promise<Object>} - Activity file contents and metadata
 * @throws {Error} - If activity file doesn't exist or can't be read
 */
export default async function get_activity_file({
  activity_id,
  system_base_directory,
  user_base_directory
}) {
  // Check if activity exists
  const activity_file_exists = await activity_exists({
    activity_id,
    system_base_directory,
    user_base_directory
  })

  if (!activity_file_exists) {
    throw new Error(`Activity '${activity_id}' does not exist`)
  }

  // Get the file path using the shared helper
  const { file_path } = resolve_activity_path({
    activity_id,
    system_base_directory,
    user_base_directory
  })

  log(`Reading activity file from ${file_path}`)

  try {
    // Read the file contents
    const content = await fs.readFile(file_path, 'utf-8')

    return {
      activity_id,
      file_path,
      content,
      exists: true
    }
  } catch (error) {
    log(`Error reading activity file: ${error.message}`)
    throw new Error(`Failed to read activity file: ${error.message}`)
  }
}
