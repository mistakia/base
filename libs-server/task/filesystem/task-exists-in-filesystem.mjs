import debug from 'debug'
import { file_exists_in_filesystem } from '#libs-server/filesystem/file-exists-in-filesystem.mjs'
import { resolve_base_uri_from_registry } from '#libs-server/base-uri/index.mjs'

const log = debug('task:exists-in-filesystem')

/**
 * Check if a task file exists in the filesystem
 *
 * @param {Object} params - Parameters
 * @param {string} params.base_uri - URI identifying the task (e.g., 'user:task/name.md', 'sys:task/name.md')
 * @returns {Promise<boolean>} - True if task exists, false otherwise
 */
export async function task_exists_in_filesystem({ base_uri }) {
  try {
    log(`Checking if task exists in filesystem: ${base_uri}`)

    // Resolve absolute path using registry
    const absolute_path = resolve_base_uri_from_registry(base_uri)

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
