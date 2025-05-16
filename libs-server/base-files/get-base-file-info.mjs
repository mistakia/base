/**
 * Base file info utilities
 *
 * Provides functionality for retrieving information about files in the Base system,
 * including handling files in submodules.
 */

import path from 'path'
import debug from 'debug'
import * as git_ops from '#libs-server/git/index.mjs'

// Setup logger
const log = debug('files:info')

/**
 * Get detailed file information for a path within the Base system
 * Determines if the file belongs to the main repo or a submodule
 *
 * @param {Object} params - Parameters
 * @param {string} params.base_relative_path - Path relative to Base root
 * @param {string} params.root_base_directory - Absolute path to the Base root directory
 * @returns {Promise<Object>} File information including repo path, relative paths, and absolute path
 */
export async function get_base_file_info({
  base_relative_path,
  root_base_directory
}) {
  try {
    log(
      `Getting file info for path "${base_relative_path}" in Base root "${root_base_directory}"`
    )

    // Get all submodules in the repository
    const submodules = await git_ops.list_submodules({
      repo_path: root_base_directory
    })

    // Clean the input path (remove leading/trailing slashes)
    const clean_path = base_relative_path.replace(/^\/|\/$/g, '')

    // Determine if the file is in a submodule or the main repo
    let repo_path = root_base_directory
    let git_relative_path = clean_path

    for (const submodule of submodules) {
      const submodule_path = submodule.path

      // Check if the file path starts with the submodule path
      if (clean_path.startsWith(`${submodule_path}/`)) {
        // This file is in a submodule
        repo_path = path.join(root_base_directory, submodule_path)

        // Update the git relative path to be relative to the submodule
        git_relative_path = clean_path.substring(submodule_path.length + 1) // +1 for the slash

        log(
          `File is in submodule: ${submodule_path}, git_relative_path: ${git_relative_path}`
        )
        break
      }
    }

    // Calculate the absolute path
    const absolute_path = path.join(root_base_directory, clean_path)

    return {
      repo_path,
      base_relative_path: clean_path,
      absolute_path,
      git_relative_path
    }
  } catch (error) {
    log(`Error getting file info for path "${base_relative_path}":`, error)
    throw new Error(`Failed to get file info: ${error.message}`)
  }
}

// Default export for convenient importing
export default {
  get_base_file_info
}
