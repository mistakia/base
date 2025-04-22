import path from 'path'
import config from '#config'

// Constants for guideline directories
export const SYSTEM_GUIDELINES_DIR = 'system/guidelines'
export const USER_GUIDELINES_DIR = 'guidelines'

/**
 * Get the base directory for system guidelines
 *
 * @param {Object} params Parameters
 * @param {string} [params.system_base_directory] Custom system base directory
 * @returns {string} Full path to system guidelines directory
 */
export function get_system_guidelines_directory({
  system_base_directory = config.system_base_directory
} = {}) {
  return path.join(system_base_directory, SYSTEM_GUIDELINES_DIR)
}

/**
 * Get the base directory for user guidelines
 *
 * @param {Object} params Parameters
 * @param {string} [params.user_base_directory] Custom user base directory
 * @returns {string} Full path to user guidelines directory
 */
export function get_user_guidelines_directory({
  user_base_directory = config.user_base_directory
} = {}) {
  return path.join(user_base_directory, USER_GUIDELINES_DIR)
}

/**
 * Resolve a guideline ID to its file path
 *
 * @param {Object} params Parameters
 * @param {string} params.guideline_id Guideline ID in format [system|user]/<file_path>.md
 * @param {string} [params.system_base_directory] Custom system base directory
 * @param {string} [params.user_base_directory] Custom user base directory
 * @returns {Object} Resolved path information
 * @throws {Error} If guideline_id is invalid
 */
export function resolve_guideline_path({
  guideline_id,
  system_base_directory = config.system_base_directory,
  user_base_directory = config.user_base_directory
}) {
  if (!guideline_id) {
    throw new Error('guideline_id is required')
  }

  // Split the guideline_id into type and path components
  const [type, ...path_parts] = guideline_id.split('/')

  if (!type || !path_parts.length) {
    throw new Error(
      'guideline_id must be in format [system|user]/<file_path>.md'
    )
  }

  // Determine the base directory and guidelines directory based on type
  let base_directory
  let guidelines_dir

  if (type === 'system') {
    base_directory = system_base_directory
    guidelines_dir = SYSTEM_GUIDELINES_DIR
  } else if (type === 'user') {
    base_directory = user_base_directory
    guidelines_dir = USER_GUIDELINES_DIR
  } else {
    throw new Error('guideline_id type must be either "system" or "user"')
  }

  // Always insert the guidelines directory between the base and the file path
  const file_path = path.join(base_directory, guidelines_dir, ...path_parts)

  return {
    type,
    base_directory,
    guidelines_dir,
    path_parts,
    file_path
  }
}
