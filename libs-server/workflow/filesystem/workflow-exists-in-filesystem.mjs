import debug from 'debug'
import { file_exists_in_filesystem } from '#libs-server/filesystem/file-exists-in-filesystem.mjs'
import { resolve_base_uri_from_registry } from '#libs-server/base-uri/index.mjs'

const log = debug('workflow:exists-in-filesystem')

/**
 * Check if a workflow file exists in the filesystem using the registry system
 *
 * @param {Object} params - Parameters
 * @param {string} params.base_uri - URI identifying the workflow (e.g., 'sys:workflow/name.md', 'user:workflow/name.md')
 * @returns {Promise<boolean>} - True if workflow exists, false otherwise
 */
export async function workflow_exists_in_filesystem({ base_uri }) {
  try {
    log(`Checking if workflow exists in filesystem: ${base_uri}`)

    // Resolve path using registry
    const absolute_path = resolve_base_uri_from_registry(base_uri)
    log(`Resolved path using registry: ${absolute_path}`)

    // Check if file exists and is readable
    return await file_exists_in_filesystem({
      absolute_path
    })
  } catch (error) {
    log(`Error checking if workflow exists: ${error.message}`)
    return false
  }
}
