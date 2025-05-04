import debug from 'debug'
import { file_exists_in_filesystem } from '#libs-server/filesystem/file-exists-in-filesystem.mjs'
import { resolve_activity_path } from '../constants.mjs'

const log = debug('activity:exists-in-filesystem')

/**
 * Check if an activity file exists in the filesystem
 *
 * @param {Object} params - Parameters
 * @param {string} params.activity_id - Activity ID in format [system|user]/<file_path>.md
 * @param {string} [params.system_base_directory] - Custom system base directory
 * @param {string} [params.user_base_directory] - Custom user base directory
 * @returns {Promise<boolean>} - True if activity exists, false otherwise
 */
export async function activity_exists_in_filesystem({
  activity_id,
  system_base_directory,
  user_base_directory
}) {
  try {
    log(`Checking if activity exists in filesystem: ${activity_id}`)

    // Use the shared path resolution helper
    const { file_path } = resolve_activity_path({
      activity_id,
      system_base_directory,
      user_base_directory
    })

    log(`Checking activity at path: ${file_path}`)

    // Check if file exists and is readable
    return await file_exists_in_filesystem({
      absolute_path: file_path
    })
  } catch (error) {
    log(`Error checking if activity exists: ${error.message}`)
    return false
  }
}
