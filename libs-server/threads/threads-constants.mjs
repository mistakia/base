import path from 'path'
import config from '#config'

export const THREAD_CONTEXT_DIR = 'threads'
export const THREAD_DEFAULT_ACTIVITY_BASE_RELATIVE_PATH =
  'system/activity/default-base-activity.md'

/**
 * Get the base directory for thread storage
 *
 * @param {Object} params Parameters
 * @param {string} [params.root_base_directory] Custom root base directory
 * @returns {string} Full path to thread base directory
 */
export function get_thread_base_directory({
  user_base_directory = config.user_base_directory
} = {}) {
  if (!user_base_directory) {
    throw new Error('user_base_directory is required')
  }

  return path.join(user_base_directory, THREAD_CONTEXT_DIR)
}
