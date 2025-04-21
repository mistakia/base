import path from 'path'
import config from '#config'

// Constants for activity directories
export const SYSTEM_ACTIVITIES_DIR = 'system/activities'
export const USER_ACTIVITIES_DIR = 'activities'

/**
 * Get the base directory for system activities
 *
 * @param {Object} params Parameters
 * @param {string} [params.system_base_directory] Custom system base directory
 * @returns {string} Full path to system activities directory
 */
export function get_system_activities_directory({
  system_base_directory = config.system_base_directory
} = {}) {
  return path.join(system_base_directory, SYSTEM_ACTIVITIES_DIR)
}

/**
 * Get the base directory for user activities
 *
 * @param {Object} params Parameters
 * @param {string} [params.user_base_directory] Custom user base directory
 * @returns {string} Full path to user activities directory
 */
export function get_user_activities_directory({
  user_base_directory = config.user_base_directory
} = {}) {
  return path.join(user_base_directory, USER_ACTIVITIES_DIR)
}

/**
 * Resolve an activity ID to its file path
 *
 * @param {Object} params Parameters
 * @param {string} params.activity_id Activity ID in format [system|user]/<file_path>.md
 * @param {string} [params.system_base_directory] Custom system base directory
 * @param {string} [params.user_base_directory] Custom user base directory
 * @returns {Object} Resolved path information
 * @throws {Error} If activity_id is invalid
 */
export function resolve_activity_path({
  activity_id,
  system_base_directory = config.system_base_directory,
  user_base_directory = config.user_base_directory
}) {
  if (!activity_id) {
    throw new Error('activity_id is required')
  }

  // Split the activity_id into type and path components
  const [type, ...path_parts] = activity_id.split('/')

  if (!type || !path_parts.length) {
    throw new Error(
      'activity_id must be in format [system|user]/<file_path>.md'
    )
  }

  // Determine the base directory and activities directory based on type
  let base_directory
  let activities_dir

  if (type === 'system') {
    base_directory = system_base_directory
    activities_dir = SYSTEM_ACTIVITIES_DIR
  } else if (type === 'user') {
    base_directory = user_base_directory
    activities_dir = USER_ACTIVITIES_DIR
  } else {
    throw new Error('activity_id type must be either "system" or "user"')
  }

  // Always insert the activities directory between the base and the file path
  const file_path = path.join(base_directory, activities_dir, ...path_parts)

  return {
    type,
    base_directory,
    activities_dir,
    path_parts,
    file_path
  }
}
