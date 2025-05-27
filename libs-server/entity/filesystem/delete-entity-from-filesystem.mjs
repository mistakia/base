import debug from 'debug'
import { promises as fs } from 'fs'
import { file_exists_in_filesystem } from '#libs-server/filesystem/file-exists-in-filesystem.mjs'

const log = debug('delete-entity-from-filesystem')

/**
 * Deletes an entity from the filesystem
 *
 * @param {Object} options - Function options
 * @param {string} options.absolute_path - The absolute path of the entity file to delete
 * @returns {Promise<boolean>} - Whether the deletion was successful
 */
export async function delete_entity_from_filesystem({ absolute_path }) {
  try {
    log(`Deleting entity from filesystem at ${absolute_path}`)

    if (!absolute_path) {
      throw new Error('Absolute path is required')
    }

    // Check if the file exists before attempting to delete
    const file_exists = await file_exists_in_filesystem({
      absolute_path
    })

    if (!file_exists) {
      log(`Entity file does not exist at ${absolute_path}`)
      return false
    }

    // Delete the file
    await fs.unlink(absolute_path)

    log(`Successfully deleted entity at ${absolute_path}`)
    return true
  } catch (error) {
    log(`Error deleting entity from filesystem at ${absolute_path}:`, error)
    throw error
  }
}
