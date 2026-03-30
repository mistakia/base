import debug from 'debug'
import path from 'path'

import config from '#config'
import { PermissionContext } from './permission-context.mjs'
import { map_thread_id_to_base_uri } from './resource-metadata.mjs'
import { create_base_uri_from_path } from '#libs-server/base-uri/base-uri-utilities.mjs'

const log = debug('permission:middleware')

/**
 * Middleware to attach a PermissionContext to the request object
 *
 * This should be applied early in the middleware chain for routes that
 * need permission checking. The context is reused across multiple
 * permission checks within the same request.
 *
 * @returns {Function} Express middleware function
 */
export const attach_permission_context = () => {
  return (req, _res, next) => {
    const user_public_key = req.user?.user_public_key || null
    req.permission_context = new PermissionContext({ user_public_key })
    log(`Attached permission context for user: ${user_public_key || 'public'}`)
    next()
  }
}

/**
 * Get or create permission context from request
 *
 * @param {Object} req - Express request object
 * @returns {PermissionContext} Permission context
 */
const get_permission_context = (req) => {
  if (!req.permission_context) {
    const user_public_key = req.user?.user_public_key || null
    req.permission_context = new PermissionContext({ user_public_key })
  }
  return req.permission_context
}

/**
 * Middleware to check thread access permissions
 *
 * Sets req.access with read_allowed, write_allowed, and reason.
 *
 * @returns {Function} Express middleware function
 */
export const check_thread_permission_middleware = () => {
  return async (req, _res, next) => {
    try {
      const thread_id = req.params.thread_id

      if (!thread_id) {
        return next() // No specific thread, might be listing
      }

      log(`Checking thread permission for thread ${thread_id}`)

      const context = get_permission_context(req)
      const resource_path = map_thread_id_to_base_uri(thread_id)
      const share_token = req.query.share_token || null
      const result = await context.check_permission({ resource_path, share_token })

      // Defensive check for result structure
      const read_allowed = result?.read?.allowed ?? false
      const write_allowed = result?.write?.allowed ?? false
      const reason = result?.read?.reason ?? 'Permission check failed'

      req.access = {
        user_public_key: context.user_public_key,
        resource_path,
        read_allowed,
        write_allowed,
        reason
      }

      if (!read_allowed) {
        log(`Access denied to thread ${thread_id}: ${reason}`)
      }

      next()
    } catch (error) {
      log(`Error checking thread permission: ${error.message}`)
      next(error)
    }
  }
}

/**
 * Middleware to check filesystem path permissions
 *
 * Sets req.access with read_allowed, write_allowed, and reason.
 *
 * @returns {Function} Express middleware function
 */
export const check_filesystem_permission = () => {
  return async (req, _res, next) => {
    try {
      const user_base_dir = config.user_base_directory
      const request_path = req.query.path || req.params.path || ''
      const full_path = path.join(user_base_dir, request_path)

      // Convert full filesystem path to base-uri
      const resource_path = create_base_uri_from_path(full_path)
      log(`Checking filesystem permission for ${resource_path}`)

      const context = get_permission_context(req)
      const share_token = req.query.share_token || null
      const result = await context.check_permission({ resource_path, share_token })

      // Defensive check for result structure
      const read_allowed = result?.read?.allowed ?? false
      const write_allowed = result?.write?.allowed ?? false
      const reason = result?.read?.reason ?? 'Permission check failed'

      req.access = {
        user_public_key: context.user_public_key,
        resource_path,
        read_allowed,
        write_allowed,
        reason
      }

      if (!read_allowed) {
        log(`Access denied to ${resource_path}: ${reason}`)
      }

      next()
    } catch (error) {
      log(`Error checking filesystem permission: ${error.message}`)
      next(error)
    }
  }
}
