import debug from 'debug'
import { file_exists_in_filesystem } from '#libs-server/filesystem/file-exists-in-filesystem.mjs'
import { resolve_base_uri_from_registry } from '#libs-server/base-uri/index.mjs'

const log = debug('guideline:exists-in-filesystem')

/**
 * Check if a guideline file exists in the filesystem
 *
 * @param {Object} params - Parameters
 * @param {string} params.base_uri - URI identifying the guideline (e.g., 'sys:guideline/name.md', 'user:guideline/name.md')
 * @returns {Promise<boolean>} - True if guideline exists, false otherwise
 */
export async function guideline_exists_in_filesystem({ base_uri }) {
  try {
    log(`Checking if guideline exists in filesystem: ${base_uri}`)

    // Resolve absolute path using registry
    const absolute_path = resolve_base_uri_from_registry(base_uri)

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
