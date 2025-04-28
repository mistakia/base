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
