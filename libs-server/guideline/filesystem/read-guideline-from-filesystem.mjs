import fs from 'fs/promises'
import debug from 'debug'
import { guideline_exists_in_filesystem } from './guideline-exists-in-filesystem.mjs'
import { resolve_guideline_path } from '../constants.mjs'

const log = debug('guideline:read-from-filesystem')

/**
 * Read a guideline file from the filesystem
 *
 * @param {Object} params - Parameters
 * @param {string} params.guideline_id - Guideline ID in format [system|user]/<file_path>.md
 * @param {string} [params.system_base_directory] - Custom system base directory
 * @param {string} [params.user_base_directory] - Custom user base directory
 * @returns {Promise<Object>} - Guideline file contents and metadata
 */
export async function read_guideline_from_filesystem({
  guideline_id,
  system_base_directory,
  user_base_directory
}) {
  log(`Reading guideline from filesystem: ${guideline_id}`)

  try {
    // Check if guideline exists
    const guideline_file_exists = await guideline_exists_in_filesystem({
      guideline_id,
      system_base_directory,
      user_base_directory
    })

    if (!guideline_file_exists) {
      return {
        success: false,
        error: `Guideline '${guideline_id}' does not exist in filesystem`,
        guideline_id,
        exists: false
      }
    }

    // Get the file path using the shared helper
    const { file_path } = resolve_guideline_path({
      guideline_id,
      system_base_directory,
      user_base_directory
    })

    log(`Reading guideline file from ${file_path}`)

    // Read the file contents
    const content = await fs.readFile(file_path, 'utf-8')

    return {
      success: true,
      guideline_id,
      file_path,
      content,
      exists: true
    }
  } catch (error) {
    log(`Error reading guideline file: ${error.message}`)
    return {
      success: false,
      error: `Failed to read guideline file: ${error.message}`,
      guideline_id,
      exists: false
    }
  }
}
