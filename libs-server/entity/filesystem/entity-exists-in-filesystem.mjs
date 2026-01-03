import debug from 'debug'
import { file_exists_in_filesystem } from '#libs-server/filesystem/file-exists-in-filesystem.mjs'
import { directory_exists_in_filesystem } from '#libs-server/filesystem/directory-exists-in-filesystem.mjs'

const log = debug('entity-exists-in-filesystem')

/**
 * Checks if an entity or path exists in the filesystem
 *
 * Supports both files and directories to allow relations to reference
 * non-entity files (.js, .mjs, .json) and directories.
 *
 * @param {Object} options - Function options
 * @param {string} options.absolute_path - The absolute path to check
 * @returns {Promise<boolean>} - True if the path exists and is readable
 */
export async function entity_exists_in_filesystem({ absolute_path } = {}) {
  try {
    log(`Checking if entity exists at ${absolute_path}`)

    if (!absolute_path) {
      throw new Error('Absolute path is required')
    }

    // Check if path exists as a file (most common case)
    const file_exists = await file_exists_in_filesystem({
      absolute_path
    })

    if (file_exists) {
      return true
    }

    // Fall back to directory check for directory relations
    const dir_exists = await directory_exists_in_filesystem({
      absolute_path
    })

    return dir_exists
  } catch (error) {
    log(`Error checking if entity exists at ${absolute_path}:`, error)
    return false
  }
}
