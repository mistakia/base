import path from 'path'
import config from '#config'

export const THREAD_CONTEXT_DIR = 'threads'

/**
 * Get the base directory for thread storage
 *
 * @param {Object} params Parameters
 * @param {string} [params.user_base_directory] Custom user base directory
 * @returns {string} Full path to thread base directory
 */
export function get_thread_base_directory({
  user_base_directory = config.user_base_directory
} = {}) {
  return path.join(user_base_directory, THREAD_CONTEXT_DIR)
}
