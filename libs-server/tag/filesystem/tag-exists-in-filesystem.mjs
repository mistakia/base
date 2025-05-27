import debug from 'debug'
import { file_exists_in_filesystem } from '#libs-server/filesystem/file-exists-in-filesystem.mjs'
import { get_base_file_info } from '#libs-server/base-files/get-base-file-info.mjs'
import config from '#config'

const log = debug('tag:exists-in-filesystem')

/**
 * Check if a tag file exists in the filesystem
 *
 * @param {Object} params - Parameters
 * @param {string} params.base_relative_path - Relative path to the tag file
 * @param {string} [params.root_base_directory] - Root base directory
 * @returns {Promise<boolean>} - True if tag exists, false otherwise
 */
export async function tag_exists_in_filesystem({
  base_relative_path,
  root_base_directory = config.root_base_directory
} = {}) {
  if (!base_relative_path) {
    throw new Error('base_relative_path is required')
  }

  try {
    log(`Checking if tag exists in filesystem: ${base_relative_path}`)

    // Get file info
    const { absolute_path } = await get_base_file_info({
      base_relative_path,
      root_base_directory
    })

    log(`Checking tag at path: ${absolute_path}`)

    // Check if file exists and is readable
    return await file_exists_in_filesystem({
      absolute_path
    })
  } catch (error) {
    log(`Error checking if tag exists: ${error.message}`)
    return false
  }
}
