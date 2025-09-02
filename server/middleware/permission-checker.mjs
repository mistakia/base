import debug from 'debug'
import user_registry from '#libs-server/users/user-registry.mjs'
import { evaluate_permission_rules } from './rule-engine.mjs'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import {
  resolve_base_uri,
  create_base_uri_from_path
} from '#libs-server/base-uri/base-uri-utilities.mjs'

const log = debug('permission:checker')

/**
 * Maps a filesystem path to a base-uri path
 * Uses the existing base-uri utility for consistency
 *
 * @param {string} filesystem_path - Filesystem path to map
 * @returns {string} Base-URI path (e.g., "user:task/example" or "sys:workflow/test")
 */
export const map_filesystem_path_to_base_uri = create_base_uri_from_path

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
 * Checks if an entity has public_read enabled
 *
 * @param {string} resource_path - Base-URI path of the resource
 * @returns {Promise<boolean>} True if entity has public_read enabled
 */
const check_entity_public_read = async (resource_path) => {
  try {
    // Convert base-uri to filesystem path
    const absolute_path = resolve_base_uri(resource_path)

    if (!absolute_path) {
      log(`Could not map resource path to filesystem: ${resource_path}`)
      return false
    }

    // Try to read the entity
    const result = await read_entity_from_filesystem({ absolute_path })

    if (!result.success) {
      log(`Could not read entity at ${absolute_path}: ${result.error}`)
      return false
    }

    // Check if public_read is enabled
    const public_read = result.entity_properties?.public_read
    const is_public = public_read === true

    log(`Entity ${resource_path} public_read status: ${is_public}`)
    return is_public
  } catch (error) {
    log(`Error checking public_read for ${resource_path}: ${error.message}`)
    return false
  }
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
 * Note: This function is focused on read operations. Write permissions are limited to owner only.
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
    `Checking read permission for user: ${user_public_key || 'public'}, resource: ${resource_path}`
  )

  // Check for public_read access first
  const is_public_readable = await check_entity_public_read(resource_path)

  if (is_public_readable) {
    log(`Public read access granted for resource: ${resource_path}`)
    return {
      allowed: true,
      reason: 'Resource has public_read enabled'
    }
  }

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
 * Batch checks permissions for multiple resources (read operations only)
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

  // Check each resource path using the main permission check function
  const results = {}
  for (const resource_path of resource_paths) {
    results[resource_path] = await check_user_permission({
      user_public_key,
      resource_path
    })
  }

  return results
}

/**
 * Checks if a user has permission to access a file by its absolute filesystem path (read operations only)
 *
 * @param {Object} params - Parameters for permission check
 * @param {string} params.user_public_key - User's public key
 * @param {string} params.absolute_path - Absolute filesystem path to check
 * @returns {Promise<boolean>} True if user has read access permission
 */
export const check_user_permission_for_file = async ({
  user_public_key,
  absolute_path
}) => {
  if (!absolute_path) {
    log('No absolute_path provided for permission check')
    return false
  }

  // Convert filesystem path to base_uri
  const resource_path = map_filesystem_path_to_base_uri(absolute_path)
  log(`Checking file permission: ${absolute_path} -> ${resource_path}`)

  // Use existing permission check with base_uri
  const result = await check_user_permission({
    user_public_key,
    resource_path
  })

  return result.allowed
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
