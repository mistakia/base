import path from 'path'
import debug from 'debug'
import config from '#config'
import user_registry from '#libs-server/users/user-registry.mjs'
import { evaluate_permission_rules } from './rule-engine.mjs'

const log = debug('permission:checker')

/**
 * Maps a filesystem path to a base-uri path
 *
 * @param {string} filesystem_path - Filesystem path to map
 * @returns {string} Base-URI path (e.g., "user:task/example" or "sys:workflow/test")
 */
export const map_filesystem_path_to_base_uri = (filesystem_path) => {
  if (!filesystem_path || typeof filesystem_path !== 'string') {
    return ''
  }

  // Get configured paths
  const user_base_dir =
    config.user_base_directory || process.env.USER_BASE_DIRECTORY
  const system_base_dir = path.resolve(process.cwd()) // Base repository directory

  // Normalize the filesystem path
  const normalized_path = path.resolve(filesystem_path)

  // Check if path is under user directory
  if (user_base_dir && normalized_path.startsWith(user_base_dir)) {
    const relative_path = path.relative(user_base_dir, normalized_path)
    return `user:${relative_path.replace(/\\/g, '/')}`
  }

  // Check if path is under system directory
  if (normalized_path.startsWith(system_base_dir)) {
    const relative_path = path.relative(system_base_dir, normalized_path)
    return `sys:${relative_path.replace(/\\/g, '/')}`
  }

  // Default to user path for unknown paths
  const basename = path.basename(normalized_path)
  return `user:${basename}`
}

/**
 * Maps a thread ID to a base-uri path
 *
 * @param {string} thread_id - Thread ID to map
 * @returns {string} Base-URI path (e.g., "user:thread/abc123")
 */
export const map_thread_id_to_base_uri = (thread_id) => {
  if (!thread_id || typeof thread_id !== 'string') {
    return ''
  }

  return `user:thread/${thread_id}`
}

/**
 * Gets user permission rules from the registry
 *
 * @param {string} user_public_key - User's public key
 * @returns {Array} Array of permission rules or empty array
 */
const get_user_permission_rules = async (user_public_key) => {
  if (!user_public_key) {
    log('No user public key provided, checking for public user permissions')
    // Fall back to public user permissions for unauthenticated requests
    try {
      const public_user = await user_registry.find_by_public_key('public')
      if (
        public_user &&
        public_user.permissions &&
        Array.isArray(public_user.permissions.rules)
      ) {
        log('Using public user permissions for unauthenticated request')
        return public_user.permissions.rules
      }
    } catch (error) {
      log(`Error loading public user permissions: ${error.message}`)
    }

    log('No public user found, returning empty rules')
    return []
  }

  try {
    const user = await user_registry.find_by_public_key(user_public_key)
    if (!user) {
      log(`User not found: ${user_public_key}`)
      return []
    }

    // Check for new permission structure with rules array
    if (user.permissions && Array.isArray(user.permissions.rules)) {
      return user.permissions.rules
    }

    // Fallback to empty rules if no permissions configured
    log(`No permission rules found for user: ${user_public_key}`)
    return []
  } catch (error) {
    log(`Error loading user permissions: ${error.message}`)
    return []
  }
}

/**
 * Checks if a user has permission to access a resource
 *
 * @param {Object} params - Parameters for permission check
 * @param {string|null} params.user_public_key - User's public key, null for public access
 * @param {string} params.resource_path - Base-URI path of the resource
 * @returns {Object} Permission result with allowed status and reason
 */
export const check_user_permission = async ({
  user_public_key = null,
  resource_path
}) => {
  log(
    `Checking permission for user: ${user_public_key || 'public'}, resource: ${resource_path}`
  )

  // Get user's permission rules
  const rules = await get_user_permission_rules(user_public_key)

  // Evaluate rules against the resource path
  const result = await evaluate_permission_rules({
    rules,
    resource_path,
    user_public_key
  })

  log(
    `Permission check result: ${result.allowed ? 'ALLOWED' : 'DENIED'} - ${result.reason}`
  )

  return result
}

/**
 * Batch checks permissions for multiple resources
 *
 * @param {Object} params - Parameters for batch permission check
 * @param {string|null} params.user_public_key - User's public key
 * @param {Array} params.resource_paths - Array of base-URI paths to check
 * @returns {Object} Map of resource paths to permission results
 */
export const check_user_permissions_batch = async ({
  user_public_key = null,
  resource_paths
}) => {
  if (!Array.isArray(resource_paths)) {
    throw new Error('resource_paths must be an array')
  }

  // Get user's permission rules once
  const rules = await get_user_permission_rules(user_public_key)

  // Check each resource path
  const results = {}
  for (const resource_path of resource_paths) {
    results[resource_path] = await evaluate_permission_rules({
      rules,
      resource_path,
      user_public_key
    })
  }

  return results
}

/**
 * Validates if a user owns a thread
 *
 * @param {Object} params - Parameters for ownership check
 * @param {string} params.thread_id - Thread ID to check ownership for
 * @param {string} params.user_public_key - User's public key
 * @returns {boolean} True if user owns the thread
 */
export const validate_thread_ownership = async ({
  thread_id,
  user_public_key
}) => {
  if (!thread_id || !user_public_key) {
    return false
  }

  try {
    // For now, import threads module to check thread ownership
    const threads = await import('#libs-server/threads/index.mjs')

    // Get the thread and check if it belongs to the user
    const thread = await threads.get_thread({ thread_id })
    if (thread && thread.user_public_key === user_public_key) {
      log(
        `Thread ownership confirmed for thread: ${thread_id}, user: ${user_public_key}`
      )
      return true
    }

    log(
      `Thread ownership denied for thread: ${thread_id}, user: ${user_public_key}`
    )
    return false
  } catch (error) {
    log(`Error checking thread ownership: ${error.message}`)
    return false
  }
}
