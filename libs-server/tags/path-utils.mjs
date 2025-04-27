import path from 'path'
import config from '#config'
import { SYSTEM_TAG_DIR, USER_TAG_DIR } from './constants.mjs'

/**
 * Resolve a tag ID to its file path
 *
 * @param {Object} params Parameters
 * @param {string} params.tag_id Tag ID in format [system|user]/<file-path>.md
 * @param {string} [params.system_base_directory] Custom system base directory
 * @param {string} [params.user_base_directory] Custom user base directory
 * @returns {Object} Resolved path information
 * @throws {Error} If tag_id is invalid
 */
export function resolve_tag_path({
  tag_id,
  system_base_directory = config.system_base_directory,
  user_base_directory = config.user_base_directory
}) {
  if (!tag_id) {
    throw new Error('tag_id is required')
  }

  // Split the tag_id into type and path components
  const [type, ...path_parts] = tag_id.split('/')

  if (!type || !path_parts.length) {
    throw new Error('tag_id must be in format [system|user]/<file-path>.md')
  }

  // Determine the base directory and tags directory based on type
  let base_directory
  let tag_dir

  if (type === 'system') {
    base_directory = system_base_directory
    tag_dir = SYSTEM_TAG_DIR
  } else if (type === 'user') {
    base_directory = user_base_directory
    tag_dir = USER_TAG_DIR
  } else {
    throw new Error('tag_id type must be either "system" or "user"')
  }

  // Always insert the tags directory between the base and the file path
  const file_path = path.join(base_directory, tag_dir, ...path_parts)

  return {
    type,
    base_directory,
    tag_dir,
    path_parts,
    file_path
  }
}
