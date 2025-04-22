import fs from 'fs/promises'
import debug from 'debug'
import guideline_exists from './guideline_exists.mjs'
import { resolve_guideline_path } from './constants.mjs'

const log = debug('guidelines:get')

/**
 * Get the contents of a guideline file
 *
 * @param {Object} params - Parameters
 * @param {string} params.guideline_id - Guideline ID in format [system|user]/<file_path>.md (e.g., system/write_javascript.md)
 * @param {string} [params.system_base_directory] - Custom system base directory
 * @param {string} [params.user_base_directory] - Custom user base directory
 * @returns {Promise<Object>} - Guideline file contents and metadata
 * @throws {Error} - If guideline file doesn't exist or can't be read
 */
export default async function get_guideline_file({
  guideline_id,
  system_base_directory,
  user_base_directory
}) {
  // Check if guideline exists
  const guideline_file_exists = await guideline_exists({
    guideline_id,
    system_base_directory,
    user_base_directory
  })

  if (!guideline_file_exists) {
    throw new Error(`Guideline '${guideline_id}' does not exist`)
  }

  // Get the file path using the shared helper
  const { file_path } = resolve_guideline_path({
    guideline_id,
    system_base_directory,
    user_base_directory
  })

  log(`Reading guideline file from ${file_path}`)

  try {
    // Read the file contents
    const content = await fs.readFile(file_path, 'utf-8')

    return {
      guideline_id,
      file_path,
      content,
      exists: true
    }
  } catch (error) {
    log(`Error reading guideline file: ${error.message}`)
    throw new Error(`Failed to read guideline file: ${error.message}`)
  }
}
