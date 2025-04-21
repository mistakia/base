import fs from 'fs/promises'
import debug from 'debug'
import { resolve_activity_path } from './constants.mjs'

const log = debug('activities:exists')

/**
 * Check if an activity file exists
 *
 * @param {Object} params - Parameters
 * @param {string} params.activity_id - Activity ID in format [system|user]/<file_path>.md (e.g., system/create_activity.md)
 * @param {string} [params.system_base_directory] - Custom system base directory
 * @param {string} [params.user_base_directory] - Custom user base directory
 * @returns {Promise<boolean>} - True if activity exists, false otherwise
 */
export default async function activity_exists({
  activity_id,
  system_base_directory,
  user_base_directory
}) {
  try {
    // Use the shared path resolution helper
    const { file_path } = resolve_activity_path({
      activity_id,
      system_base_directory,
      user_base_directory
    })

    log(`Checking if activity exists at ${file_path}`)

    // Check if file exists and is readable
    await fs.access(file_path, fs.constants.R_OK)
    return true
  } catch (error) {
    if (error.code === 'ENOENT') {
      log(`Activity file not found or not readable: ${error.message}`)
      return false
    }
    // Re-throw any errors that aren't about the file not existing
    throw error
  }
}
