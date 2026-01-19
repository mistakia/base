import debug from 'debug'

import user_registry from '#libs-server/users/user-registry.mjs'
import { create_base_uri_from_path } from '#libs-server/base-uri/base-uri-utilities.mjs'
import { PermissionContext } from './permission-context.mjs'
import {
  load_resource_metadata,
  load_thread_metadata,
  map_thread_id_to_base_uri
} from './resource-metadata.mjs'

const log = debug('permission:service')

/**
 * Check permission for a resource
 *
 * @param {Object} params - Parameters
 * @param {string|null} params.user_public_key - User's public key or null for public access
 * @param {string} params.resource_path - Base-URI path of the resource
 * @param {Object|null} params.metadata - Optional pre-loaded metadata to avoid re-reading
 * @returns {Promise<{read: {allowed: boolean, reason: string}, write: {allowed: boolean, reason: string}}>}
 */
export const check_permission = async ({
  user_public_key = null,
  resource_path,
  metadata = null
}) => {
  const context = new PermissionContext({ user_public_key })
  return context.check_permission({ resource_path, metadata })
}

/**
 * Check permission for a thread (convenience function)
 *
 * @param {Object} params - Parameters
 * @param {string|null} params.user_public_key - User's public key or null for public access
 * @param {string} params.thread_id - Thread ID to check
 * @param {Object|null} params.metadata - Optional pre-loaded thread metadata
 * @returns {Promise<{read: {allowed: boolean, reason: string}, write: {allowed: boolean, reason: string}}>}
 */
export const check_thread_permission = async ({
  user_public_key = null,
  thread_id,
  metadata = null
}) => {
  const resource_path = map_thread_id_to_base_uri(thread_id)

  // If no metadata provided, load thread metadata specifically
  const thread_metadata =
    metadata || (await load_thread_metadata({ thread_id }))

  const context = new PermissionContext({ user_public_key })
  return context.check_permission({ resource_path, metadata: thread_metadata })
}

/**
 * Check read permission for a thread (backward compatibility)
 *
 * @param {Object} params - Parameters
 * @param {string|null} params.user_public_key - User's public key or null for public access
 * @param {string} params.thread_id - Thread ID to check
 * @returns {Promise<{allowed: boolean, reason: string}>}
 */
export const check_thread_permission_for_user = async ({
  user_public_key = null,
  thread_id
}) => {
  const result = await check_thread_permission({ user_public_key, thread_id })
  return result.read
}

/**
 * Check permissions for multiple resources in batch
 *
 * This function is optimized for checking permissions on multiple resources
 * by reusing the same context (and thus cached rules) for all checks.
 * Permission checks are parallelized in chunks to avoid overwhelming the filesystem.
 *
 * @param {Object} params - Parameters
 * @param {string|null} params.user_public_key - User's public key or null for public access
 * @param {Array<string>} params.resource_paths - Array of base-URI paths to check
 * @returns {Promise<Object>} Map of resource paths to permission results
 */
export const check_permissions_batch = async ({
  user_public_key = null,
  resource_paths
}) => {
  if (!Array.isArray(resource_paths)) {
    throw new Error('resource_paths must be an array')
  }

  log(
    `Batch checking ${resource_paths.length} resources for user: ${user_public_key || 'public'}`
  )

  // Create a single context for all checks (rules are loaded once and cached)
  const context = new PermissionContext({ user_public_key })

  // Pre-warm the rules cache so parallel checks don't race to load rules
  await Promise.all([context.get_user_rules(), context.get_public_rules()])

  // CHUNK_SIZE limits concurrent permission checks since each may load resource
  // metadata from filesystem. Prevents exhausting file descriptors on large batches.
  const CHUNK_SIZE = 50
  const results = {}

  for (let i = 0; i < resource_paths.length; i += CHUNK_SIZE) {
    const chunk = resource_paths.slice(i, i + CHUNK_SIZE)
    const chunk_results = await Promise.all(
      chunk.map(async (resource_path) => ({
        resource_path,
        permission: await context.check_permission({ resource_path })
      }))
    )

    for (const { resource_path, permission } of chunk_results) {
      results[resource_path] = permission
    }
  }

  return results
}

/**
 * Validate thread ownership
 *
 * @param {Object} params - Parameters
 * @param {string} params.thread_id - Thread ID to check ownership for
 * @param {string} params.user_public_key - User's public key
 * @returns {Promise<boolean>} True if user owns the thread
 */
export const validate_thread_ownership = async ({
  thread_id,
  user_public_key
}) => {
  if (!thread_id || !user_public_key) {
    return false
  }

  try {
    const metadata = await load_thread_metadata({ thread_id })

    if (metadata && metadata.owner_public_key === user_public_key) {
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
 * Check read permission for a resource (returns simple {allowed, reason} format)
 *
 * @param {Object} params - Parameters
 * @param {string|null} params.user_public_key - User's public key or null for public access
 * @param {string} params.resource_path - Base-URI path of the resource
 * @returns {Promise<{allowed: boolean, reason: string}>}
 */
export const check_user_permission = async ({
  user_public_key = null,
  resource_path
}) => {
  const result = await check_permission({ user_public_key, resource_path })
  return result.read
}

/**
 * Check read permission for a file by absolute filesystem path
 *
 * @param {Object} params - Parameters
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

  const resource_path = create_base_uri_from_path(absolute_path)
  log(`Checking file permission: ${absolute_path} -> ${resource_path}`)

  const result = await check_permission({ user_public_key, resource_path })
  return result.read.allowed
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

/**
 * Check if user has global write permission
 *
 * @param {string} user_public_key - User's public key
 * @returns {Promise<boolean>} True if user has global_write permission
 */
export const check_global_write_permission = async (user_public_key) => {
  if (!user_public_key) {
    return false
  }

  try {
    const user = await user_registry.find_by_public_key(user_public_key)
    if (!user) {
      log(`User not found for permission check: ${user_public_key}`)
      return false
    }

    const has_permission = user.permissions?.global_write === true
    log(
      `Permission check for ${user_public_key}: global_write = ${has_permission}`
    )
    return has_permission
  } catch (error) {
    log(`Error checking global_write permission: ${error.message}`)
    return false
  }
}

/**
 * Load resource metadata (re-exported for convenience)
 */
export {
  load_resource_metadata,
  load_thread_metadata,
  map_thread_id_to_base_uri
}
