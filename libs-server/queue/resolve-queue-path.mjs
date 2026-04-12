import path from 'path'
import config from '#config'

/**
 * Resolve a queue file path from config, supporting relative paths
 * resolved against user_base_directory.
 *
 * @param {string|undefined} configured_path - Path from config
 * @param {string} fallback - Fallback absolute path
 * @returns {string} Resolved absolute path
 */
export const resolve_queue_path = (configured_path, fallback) => {
  if (!configured_path) return fallback
  if (path.isAbsolute(configured_path)) return configured_path
  if (config.user_base_directory) {
    return path.join(config.user_base_directory, configured_path)
  }
  return fallback
}
