import debug from 'debug'
import { file_exists_in_filesystem } from '#libs-server/filesystem/file-exists-in-filesystem.mjs'

const log = debug('entity-exists-in-filesystem')

/**
 * Checks if an entity exists in the filesystem
 *
 * @param {Object} options - Function options
 * @param {string} options.absolute_path - The absolute path to the entity file
 * @returns {Promise<boolean>} - True if the entity exists and is readable
 */
export async function entity_exists_in_filesystem({ absolute_path } = {}) {
  try {
    log(`Checking if entity exists at ${absolute_path}`)

    if (!absolute_path) {
      throw new Error('Absolute path is required')
    }

    const file_exists = await file_exists_in_filesystem({
      absolute_path
    })

    return file_exists
  } catch (error) {
    log(`Error checking if entity exists at ${absolute_path}:`, error)
    return false
  }
}
