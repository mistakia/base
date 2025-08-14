import debug from 'debug'
import { validate_thread_ownership } from './permission-checker.mjs'

const log = debug('permission:ownership')

/**
 * Checks if a user owns a resource based on the resource path
 *
 * @param {string} resource_path - Base-URI path of the resource
 * @param {string} user_public_key - User's public key
 * @returns {boolean} True if user owns the resource
 */
export const check_resource_ownership = async (
  resource_path,
  user_public_key
) => {
  if (!resource_path || !user_public_key) {
    log('Missing resource_path or user_public_key for ownership check')
    return false
  }

  // Parse the resource path to determine resource type
  const path_parts = resource_path.split(':')
  if (path_parts.length !== 2) {
    log(`Invalid resource path format: ${resource_path}`)
    return false
  }

  const [prefix, path] = path_parts

  // Handle different resource types
  if (prefix === 'user' && path.startsWith('thread/')) {
    // Extract thread ID from path like "user:thread/abc123"
    const thread_id = path.replace('thread/', '')
    const is_owner = await validate_thread_ownership({
      thread_id,
      user_public_key
    })
    log(`Thread ownership check for ${thread_id}: ${is_owner}`)
    return is_owner
  }

  // Add more ownership checks for other resource types as needed
  // For example:
  // - user:task/* - check if task was created by user
  // - user:workflow/* - check if workflow belongs to user
  // - user:change-request/* - check if change request was submitted by user

  log(`Ownership check not implemented for resource type: ${prefix}:${path}`)
  return false
}
