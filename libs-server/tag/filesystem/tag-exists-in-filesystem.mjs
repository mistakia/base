import debug from 'debug'
import { file_exists_in_filesystem } from '#libs-server/filesystem/file-exists-in-filesystem.mjs'
import { resolve_base_uri_from_registry } from '#libs-server/base-uri/index.mjs'

const log = debug('tag:exists-in-filesystem')

/**
 * Check if a tag file exists in the filesystem
 *
 * @param {Object} params - Parameters
 * @param {string} params.base_uri - URI identifying the tag file
 * @returns {Promise<boolean>} - True if tag exists, false otherwise
 */
export async function tag_exists_in_filesystem({ base_uri } = {}) {
  if (!base_uri) {
    throw new Error('base_uri is required')
  }

  try {
    log(`Checking if tag exists in filesystem: ${base_uri}`)

    // Resolve absolute path from base URI using registry
    const absolute_path = resolve_base_uri_from_registry(base_uri)

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
