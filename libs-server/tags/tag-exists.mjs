import fs from 'fs/promises'
import debug from 'debug'
import { read_file_from_ref } from '#libs-server/git/index.mjs'
import { resolve_tag_path } from './path-utils.mjs'

const log = debug('tags:exists')

/**
 * Check if a tag file exists in either the filesystem or a git branch
 *
 * @param {Object} params - Parameters
 * @param {string} params.tag_id - Tag ID in format [system|user]/<file_path>.md (e.g., system/tags/important.md)
 * @param {string} [params.system_branch] - Optional system branch to check tag existence in
 * @param {string} [params.user_branch] - Optional user branch to check tag existence in
 * @param {string} [params.system_base_directory] - Custom system base directory
 * @param {string} [params.user_base_directory] - Custom user base directory
 * @returns {Promise<boolean>} - True if tag exists, false otherwise
 */
export default async function tag_exists({
  tag_id,
  system_branch,
  user_branch,
  system_base_directory,
  user_base_directory
}) {
  try {
    const { file_path, base_directory, type } = resolve_tag_path({
      tag_id,
      system_base_directory,
      user_base_directory
    })

    log(`Checking if tag exists at ${file_path}`)

    // Determine which branch to use based on tag_id prefix
    const is_system_tag = type === 'system'
    const branch = is_system_tag ? system_branch : user_branch

    if (branch) {
      try {
        await read_file_from_ref({
          file_path: tag_id,
          ref: branch,
          repo_path: base_directory
        })
        return true
      } catch (error) {
        if (error.code === 'ENOENT') {
          return false
        }
        throw error
      }
    }

    // Check if file exists and is readable in filesystem
    await fs.access(file_path, fs.constants.R_OK)
    return true
  } catch (error) {
    if (error.code === 'ENOENT') {
      log(`Tag file not found or not readable: ${error.message}`)
      return false
    }
    // Re-throw any errors that aren't about the file not existing
    throw error
  }
}
