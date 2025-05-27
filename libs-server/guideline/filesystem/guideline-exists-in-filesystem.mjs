import debug from 'debug'
import { file_exists_in_filesystem } from '#libs-server/filesystem/file-exists-in-filesystem.mjs'
import { get_base_file_info } from '#libs-server/base-files/get-base-file-info.mjs'
import config from '#config'

const log = debug('guideline:exists-in-filesystem')

/**
 * Check if a guideline file exists in the filesystem
 *
 * @param {Object} params - Parameters
 * @param {string} params.base_relative_path - Guideline path relative to Base root, e.g., 'system/guideline/<file_path>.md' or 'guideline/<file_path>.md'
 * @param {string} [params.root_base_directory] - Custom root base directory
 * @returns {Promise<boolean>} - True if guideline exists, false otherwise
 */
export async function guideline_exists_in_filesystem({
  base_relative_path,
  root_base_directory = config.root_base_directory
}) {
  try {
    log(`Checking if guideline exists in filesystem: ${base_relative_path}`)

    // Get file info
    const { absolute_path } = await get_base_file_info({
      base_relative_path,
      root_base_directory
    })

    log(`Checking guideline at path: ${absolute_path}`)

    // Check if file exists and is readable
    return await file_exists_in_filesystem({
      absolute_path
    })
  } catch (error) {
    log(`Error checking if guideline exists: ${error.message}`)
    return false
  }
}
