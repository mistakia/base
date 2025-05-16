import fs from 'fs/promises'
import debug from 'debug'
import { guideline_exists_in_filesystem } from './guideline-exists-in-filesystem.mjs'
import { get_base_file_info } from '#libs-server/base-files/get-base-file-info.mjs'
import config from '#config'

const log = debug('guideline:read-from-filesystem')

/**
 * Read a guideline file from the filesystem
 *
 * @param {Object} params - Parameters
 * @param {string} params.base_relative_path - Guideline path relative to Base root, e.g., 'system/guideline/<file_path>.md' or 'guideline/<file_path>.md'
 * @param {string} [params.root_base_directory] - Custom root base directory
 * @returns {Promise<Object>} - Guideline file contents and metadata
 */
export async function read_guideline_from_filesystem({
  base_relative_path,
  root_base_directory = config.root_base_directory
}) {
  log(`Reading guideline from filesystem: ${base_relative_path}`)

  try {
    // Check if guideline exists
    const guideline_file_exists = await guideline_exists_in_filesystem({
      base_relative_path,
      root_base_directory
    })

    if (!guideline_file_exists) {
      return {
        success: false,
        error: `Guideline '${base_relative_path}' does not exist in filesystem`,
        base_relative_path,
        exists: false
      }
    }

    // Get the file path using the shared helper
    const { absolute_path } = await get_base_file_info({
      base_relative_path,
      root_base_directory
    })

    log(`Reading guideline file from ${absolute_path}`)

    // Read the file contents
    const content = await fs.readFile(absolute_path, 'utf-8')

    return {
      success: true,
      base_relative_path,
      absolute_path,
      content,
      exists: true
    }
  } catch (error) {
    log(`Error reading guideline file: ${error.message}`)
    return {
      success: false,
      error: `Failed to read guideline file: ${error.message}`,
      base_relative_path,
      exists: false
    }
  }
}
