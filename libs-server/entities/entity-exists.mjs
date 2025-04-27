import fs from 'fs/promises'
import debug from 'debug'
import { read_file_from_ref } from '#libs-server/git/index.mjs'
import config from '#config'

const log = debug('entities:exists')

/**
 * Check if an entity exists in either the filesystem or a git branch
 *
 * @param {Object} params - Parameters
 * @param {string} params.entity_path - Entity path that starts with system/ or data/ (e.g., system/users/admin or data/posts/123)
 * @param {string} [params.user_branch] - Optional user branch to check entity existence in
 * @param {string} [params.system_branch] - Optional system branch to check entity existence in
 * @param {string} [params.system_base_directory] - Custom system base directory
 * @param {string} [params.user_base_directory] - Custom user base directory
 * @returns {Promise<boolean>} - True if entity exists, false otherwise
 */
export default async function entity_exists({
  entity_path,
  user_branch,
  system_branch,
  system_base_directory = config.system_base_directory,
  user_base_directory = config.user_base_directory
}) {
  try {
    if (!entity_path) {
      throw new Error('entity_path is required')
    }

    // Determine if this is a system or user entity
    const is_system = entity_path.startsWith('system/')
    const repo_path = is_system ? system_base_directory : user_base_directory
    const branch = is_system ? system_branch : user_branch

    log(`Checking if entity exists at ${entity_path}`)

    if (branch) {
      try {
        await read_file_from_ref({
          file_path: entity_path,
          ref: branch,
          repo_path
        })
        return true
      } catch (error) {
        // Handle git "does not exist" errors
        if (error.message.includes('does not exist')) {
          return false
        }
        throw error
      }
    }

    // Check if file exists and is readable in filesystem
    await fs.access(`${repo_path}/${entity_path}`, fs.constants.R_OK)
    return true
  } catch (error) {
    if (error.code === 'ENOENT') {
      log(`Entity file not found or not readable: ${error.message}`)
      return false
    }
    // Re-throw any errors that aren't about the file not existing
    throw error
  }
}
