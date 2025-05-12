import debug from 'debug'
import { file_exists_in_filesystem } from '#libs-server/filesystem/file-exists-in-filesystem.mjs'
import { resolve_guideline_path } from '../constants.mjs'

const log = debug('guideline:exists-in-filesystem')

/**
 * Check if a guideline file exists in the filesystem
 *
 * @param {Object} params - Parameters
 * @param {string} params.guideline_id - Guideline ID in format [system|user]/<file_path>.md
 * @param {string} [params.system_base_directory] - Custom system base directory
 * @param {string} [params.user_base_directory] - Custom user base directory
 * @returns {Promise<boolean>} - True if guideline exists, false otherwise
 */
export async function guideline_exists_in_filesystem({
  guideline_id,
  system_base_directory,
  user_base_directory
}) {
  try {
    log(`Checking if guideline exists in filesystem: ${guideline_id}`)

    // Use the shared path resolution helper
    const { file_path } = resolve_guideline_path({
      guideline_id,
      system_base_directory,
      user_base_directory
    })

    log(`Checking guideline at path: ${file_path}`)

    // Check if file exists and is readable
    return await file_exists_in_filesystem({
      absolute_path: file_path
    })
  } catch (error) {
    log(`Error checking if guideline exists: ${error.message}`)
    return false
  }
}
