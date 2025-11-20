import debug from 'debug'
import path from 'path'
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
 * Checks if an entity has public_read explicitly set and its value
 *
 * @param {string} resource_path - Base-URI path of the resource
 * @returns {Promise<Object>} Object with explicit flag and value
 */
const check_entity_public_read = async (resource_path) => {
  try {
    // Convert base-uri to filesystem path
    const absolute_path = resolve_base_uri(resource_path)

    if (!absolute_path) {
      log(`Could not map resource path to filesystem: ${resource_path}`)
      return { explicit: false, value: false }
    }

    // Try to read the entity
    const result = await read_entity_from_filesystem({ absolute_path })

    if (!result.success) {
      log(`Could not read entity at ${absolute_path}: ${result.error}`)
      return { explicit: false, value: false }
    }

    // Check if public_read is explicitly set
    const public_read = result.entity_properties?.public_read
    const is_explicit = public_read !== undefined && public_read !== null
    const value = public_read === true

    log(
      `Entity ${resource_path} public_read status: explicit=${is_explicit}, value=${value}`
    )
    return { explicit: is_explicit, value }
  } catch (error) {
    log(`Error checking public_read for ${resource_path}: ${error.message}`)
    return { explicit: false, value: false }
  }
}

/**
 * Gets user permission rules from the registry
 *
 * @param {string} user_public_key - User's public key
 * @returns {Array} Array of permission rules or empty array
 */
export const get_user_permission_rules = async (user_public_key) => {
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
 * Core permission checking logic with configurable public_read checking
 *
 * Priority order:
 * 1. User-specific rules from users.json (authenticated users, excluding public user)
 *    - Only takes precedence if a rule actually matches
 * 2. public_read setting (entity file or custom checker)
 *    - Applies to all users when no user-specific rule matched
 * 3. Public user rules from users.json
 *    - Fallback for all users when neither user rules nor public_read apply
 *
 * @param {Object} params - Parameters for permission check
 * @param {string|null} params.user_public_key - User's public key, null for public access
 * @param {string} params.resource_path - Base-URI path of the resource
 * @param {Function} params.public_read_checker - Optional custom function to check public_read
 * @returns {Object} Permission result with allowed status and reason
 */
const check_permission_core = async ({
  user_public_key = null,
  resource_path,
  public_read_checker = null
}) => {
  log(
    `Checking read permission for user: ${user_public_key || 'public'}, resource: ${resource_path}`
  )

  // Step 0: Check if user is the owner of the resource (for file-based resources)
  if (user_public_key && user_public_key !== 'public') {
    try {
      // Convert resource_path (base URI) back to absolute path for ownership check
      const absolute_path = resolve_base_uri(resource_path)
      const entity_result = await read_entity_from_filesystem({ absolute_path })

      if (
        entity_result.success &&
        entity_result.entity_properties?.user_public_key
      ) {
        const is_owner =
          user_public_key === entity_result.entity_properties.user_public_key
        if (is_owner) {
          log(`User ${user_public_key} is owner of resource ${resource_path}`)
          return {
            allowed: true,
            reason: 'User is owner of the resource'
          }
        }
      }
    } catch (error) {
      log(
        `Error checking ownership for resource ${resource_path}: ${error.message}`
      )
      // Continue with regular permission check if ownership check fails
    }
  }

  // Step 1: Check users.json rules for authenticated users (excluding public user)
  if (user_public_key && user_public_key !== 'public') {
    const user_rules = await get_user_permission_rules(user_public_key)

    // Evaluate user-specific rules against the resource path only if rules exist
    if (user_rules.length > 0) {
      const user_result = await evaluate_permission_rules({
        rules: user_rules,
        resource_path,
        user_public_key
      })

      // If a user-specific rule matched, respect that decision
      if (user_result.matching_rule !== null) {
        log(
          `User permission check result: ${user_result.allowed ? 'ALLOWED' : 'DENIED'} - ${user_result.reason}`
        )
        return user_result
      }

      // If no user-specific rule matched, continue to public_read check
      log(
        `No matching user-specific rules for ${user_public_key}, continuing to public_read check`
      )
    }
  }

  // Step 2: Check for public_read setting (entity file or custom)
  const public_read_result = public_read_checker
    ? await public_read_checker(resource_path)
    : await check_entity_public_read(resource_path)

  // If public_read is explicitly set, respect that value
  if (public_read_result.explicit) {
    if (public_read_result.value) {
      log(
        `Public read access granted for resource: ${resource_path} (explicitly enabled)`
      )
      return {
        allowed: true,
        reason: 'Resource has public_read explicitly enabled'
      }
    } else {
      log(
        `Public read access denied for resource: ${resource_path} (explicitly disabled)`
      )
      return {
        allowed: false,
        reason: 'Resource has public_read explicitly disabled'
      }
    }
  }

  // Step 3: Fall back to public user rules from users.json
  const public_rules = await get_user_permission_rules('public')

  // Evaluate public user rules against the resource path
  const result = await evaluate_permission_rules({
    rules: public_rules,
    resource_path,
    user_public_key: 'public'
  })

  log(
    `Permission check result: ${result.allowed ? 'ALLOWED' : 'DENIED'} - ${result.reason}`
  )

  return result
}

/**
 * Checks if a user has permission to access a resource
 * Note: This function is focused on read operations. Write permissions are limited to owner only.
 *
 * Priority order:
 * 1. User-specific rules from users.json (authenticated users, excluding public user)
 *    - Only takes precedence if a rule actually matches
 * 2. File public_read setting
 *    - Applies to all users when no user-specific rule matched
 * 3. Public user rules from users.json
 *    - Fallback for all users when neither user rules nor public_read apply
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
  return check_permission_core({
    user_public_key,
    resource_path,
    public_read_checker: check_entity_public_read
  })
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

  // Use existing permission check with base_uri (ownership check is now in check_permission_core)
  const result = await check_user_permission({
    user_public_key,
    resource_path
  })

  return result.allowed
}

/**
 * Checks if a user has permission to access a thread
 *
 * Priority order:
 * 1. User-specific rules from users.json (authenticated users, excluding public user)
 *    - Only takes precedence if a rule actually matches
 * 2. Thread metadata public_read setting
 *    - Applies to all users when no user-specific rule matched
 * 3. Public user rules from users.json
 *    - Fallback for all users when neither user rules nor public_read apply
 *
 * @param {Object} params - Parameters for permission check
 * @param {string|null} params.user_public_key - User's public key, null for public access
 * @param {string} params.thread_id - Thread ID to check
 * @returns {Promise<Object>} Permission result with allowed status and reason
 */
export const check_thread_permission_for_user = async ({
  user_public_key = null,
  thread_id
}) => {
  const thread_resource_path = `user:thread/${thread_id}`

  // Create a custom public_read checker for thread metadata
  const check_thread_public_read = async (resource_path) => {
    try {
      // Import thread utilities dynamically to avoid circular dependencies
      const { get_thread_base_directory } = await import(
        '#libs-server/threads/threads-constants.mjs'
      )
      const { read_json_file } = await import(
        '#libs-server/threads/thread-utils.mjs'
      )

      const threads_dir = get_thread_base_directory()
      const metadata_path = path.join(threads_dir, thread_id, 'metadata.json')

      try {
        const metadata = await read_json_file({ file_path: metadata_path })

        // Check if public_read is explicitly set
        const public_read = metadata.public_read
        const is_explicit = public_read !== undefined && public_read !== null
        const value = public_read === true

        log(
          `Thread ${thread_id} public_read status: explicit=${is_explicit}, value=${value}`
        )
        return { explicit: is_explicit, value }
      } catch (metadata_error) {
        log(
          `Error reading metadata for thread ${thread_id}: ${metadata_error.message}`
        )
        return { explicit: false, value: false }
      }
    } catch (error) {
      log(
        `Error checking thread public_read for ${thread_id}: ${error.message}`
      )
      return { explicit: false, value: false }
    }
  }

  return check_permission_core({
    user_public_key,
    resource_path: thread_resource_path,
    public_read_checker: check_thread_public_read
  })
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

/**
 * Check if user has permission to create threads
 *
 * @param {string} user_public_key - User's public key
 * @returns {Promise<boolean>} True if user has create_threads permission
 */
export const check_create_threads_permission = async (user_public_key) => {
  if (!user_public_key) {
    return false
  }

  try {
    const user = await user_registry.find_by_public_key(user_public_key)
    if (!user) {
      log(`User not found for permission check: ${user_public_key}`)
      return false
    }

    const has_permission = user.permissions?.create_threads === true
    log(
      `Permission check for ${user_public_key}: create_threads = ${has_permission}`
    )
    return has_permission
  } catch (error) {
    log(`Error checking create_threads permission: ${error.message}`)
    return false
  }
}
