import fs from 'fs/promises'
import debug from 'debug'
import { guideline_exists_in_filesystem } from './guideline-exists-in-filesystem.mjs'
import { resolve_base_uri_from_registry } from '#libs-server/base-uri/index.mjs'

const log = debug('guideline:read-from-filesystem')

/**
 * Read a guideline file from the filesystem
 *
 * @param {Object} params - Parameters
 * @param {string} params.base_uri - URI identifying the guideline (e.g., 'sys:guideline/name.md', 'user:guideline/name.md')
 * @returns {Promise<Object>} - Guideline file contents and metadata
 */
export async function read_guideline_from_filesystem({ base_uri }) {
  log(`Reading guideline from filesystem: ${base_uri}`)

  try {
    // Check if guideline exists
    const guideline_file_exists = await guideline_exists_in_filesystem({
      base_uri
    })

    if (!guideline_file_exists) {
      return {
        success: false,
        error: `Guideline '${base_uri}' does not exist in filesystem`,
        base_uri,
        exists: false
      }
    }

    // Resolve absolute path using registry
    const absolute_path = resolve_base_uri_from_registry(base_uri)

    log(`Reading guideline file from ${absolute_path}`)

    // Read the file contents
    const content = await fs.readFile(absolute_path, 'utf-8')

    return {
      success: true,
      base_uri,
      absolute_path,
      content,
      exists: true
    }
  } catch (error) {
    log(`Error reading guideline file: ${error.message}`)
    return {
      success: false,
      error: `Failed to read guideline file: ${error.message}`,
      base_uri,
      exists: false
    }
  }
}
