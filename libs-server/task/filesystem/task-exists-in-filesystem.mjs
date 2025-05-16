import debug from 'debug'
import { file_exists_in_filesystem } from '#libs-server/filesystem/file-exists-in-filesystem.mjs'
import { get_base_file_info } from '#libs-server/base-files/get-base-file-info.mjs'

const log = debug('task:exists-in-filesystem')

/**
 * Check if a task file exists in the filesystem
 *
 * @param {Object} params - Parameters
 * @param {string} params.base_relative_path - Relative path to the task file
 * @param {string} [params.root_base_directory] - Root base directory
 * @returns {Promise<boolean>} - True if task exists, false otherwise
 */
export async function task_exists_in_filesystem({
  base_relative_path,
  root_base_directory
}) {
  try {
    log(`Checking if task exists in filesystem: ${base_relative_path}`)

    // Use the base file info helper
    const { absolute_path } = await get_base_file_info({
      base_relative_path,
      root_base_directory
    })

    log(`Checking task at path: ${absolute_path}`)

    // Check if file exists and is readable
    return await file_exists_in_filesystem({
      absolute_path
    })
  } catch (error) {
    log(`Error checking if task exists: ${error.message}`)
    return false
  }
}
