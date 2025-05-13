import path from 'path'
import config from '#config'

// Constants for tag directories
export const SYSTEM_TAG_DIR = 'system/tag'
export const USER_TAG_DIR = 'tag'

/**
 * Get the base directory for system tags
 *
 * @param {Object} params Parameters
 * @param {string} [params.system_base_directory] Custom system base directory
 * @returns {string} Full path to system tags directory
 */
export function get_system_tag_directory({
  system_base_directory = config.system_base_directory
} = {}) {
  return path.join(system_base_directory, SYSTEM_TAG_DIR)
}

/**
 * Get the base directory for user tags
 *
 * @param {Object} params Parameters
 * @param {string} [params.user_base_directory] Custom user base directory
 * @returns {string} Full path to user tags directory
 */
export function get_user_tag_directory({
  user_base_directory = config.user_base_directory
} = {}) {
  return path.join(user_base_directory, USER_TAG_DIR)
}

/**
 * Resolve a tag path from a tag_id
 *
 * @param {Object} params Parameters
 * @param {string} params.tag_id Tag ID in the format [system|user]/<tag-title>
 * @param {string} [params.system_base_directory] Custom system base directory
 * @param {string} [params.user_base_directory] Custom user base directory
 * @returns {Object} Resolved path information
 */
export function resolve_tag_path({
  tag_id,
  system_base_directory = config.system_base_directory,
  user_base_directory = config.user_base_directory
}) {
  if (!tag_id) {
    throw new Error('tag_id is required')
  }

  // Split the tag_id into type and title components
  const [type, ...title_parts] = tag_id.split('/')

  if (!type || !title_parts.length) {
    throw new Error('tag_id must be in format [system|user]/<tag-title>')
  }

  // Determine the base directory and tag directory based on type
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

  const tag_title = title_parts.join('/')
  const base_relative_path = path.join(tag_dir, `${tag_title}.json`)

  // Full file path
  const file_path = path.join(base_directory, base_relative_path)

  return {
    type,
    base_directory,
    base_relative_path,
    tag_dir,
    tag_title,
    file_path
  }
}
