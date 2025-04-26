import fs from 'fs/promises'
import debug from 'debug'
import { resolve_guideline_path } from './constants.mjs'

const log = debug('guidelines:exists')

/**
 * Check if a guideline file exists
 *
 * @param {Object} params - Parameters
 * @param {string} params.guideline_id - Guideline ID in format [system|user]/<file_path>.md (e.g., system/write_javascript.md)
 * @param {string} [params.system_base_directory] - Custom system base directory
 * @param {string} [params.user_base_directory] - Custom user base directory
 * @returns {Promise<boolean>} - True if guideline exists, false otherwise
 */
export default async function guideline_exists({
  guideline_id,
  system_base_directory,
  user_base_directory
}) {
  try {
    // Use the shared path resolution helper
    const { file_path } = resolve_guideline_path({
      guideline_id,
      system_base_directory,
      user_base_directory
    })

    log(`Checking if guideline exists at ${file_path}`)

    // Check if file exists and is readable
    await fs.access(file_path, fs.constants.R_OK)
    return true
  } catch (error) {
    if (error.code === 'ENOENT') {
      log(`Guideline file not found or not readable: ${error.message}`)
      return false
    }
    // Re-throw any errors that aren't about the file not existing
    throw error
  }
}
