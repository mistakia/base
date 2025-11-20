import debug from 'debug'
import path from 'path'
import config from '#config'

import {
  check_user_permission,
  map_filesystem_path_to_base_uri,
  map_thread_id_to_base_uri,
  validate_thread_ownership
} from './permission-checker.mjs'
import {
  redact_file_info,
  redact_file_content_response,
  redact_thread_data
} from './content-redactor.mjs'

const log = debug('permission:middleware')

/**
 * Creates permission middleware for Express routes
 *
 * @param {Object} options - Middleware options
 * @param {Array} options.exclude_paths - Paths to exclude from permission checking
 * @returns {Function} Express middleware function
 */
export const create_permission_middleware = (options = {}) => {
  const { exclude_paths = [] } = options

  return async (req, res, next) => {
    // Check if path should be excluded from permission checking
    const should_exclude = exclude_paths.some((excluded_path) => {
      if (typeof excluded_path === 'string') {
        return req.path === excluded_path
      } else if (excluded_path instanceof RegExp) {
        return excluded_path.test(req.path)
      }
      return false
    })

    if (should_exclude) {
      log(`Skipping permission check for excluded path: ${req.path}`)
      return next()
    }

    next()
  }
}

/**
 * Middleware to check filesystem path permissions
 *
 * @returns {Function} Express middleware function
 */
export const check_filesystem_permission = () => {
  return async (req, res, next) => {
    try {
      const user_public_key = req.user?.user_public_key || null
      const request_path = req.query.path || req.params.path || ''

      // Resolve path relative to user base directory for correct base-uri mapping
      const user_base_dir = config.user_base_directory
      const full_path = path.join(user_base_dir, request_path)

      // Convert full filesystem path to base-uri
      const resource_path = map_filesystem_path_to_base_uri(full_path)
      log(`Checking filesystem permission for ${resource_path}`)

      // Check read permission
      const read_result = await check_user_permission({
        user_public_key,
        resource_path
      })

      // Set structured access object
      req.access = {
        user_public_key,
        resource_path,
        read_allowed: !!read_result.allowed,
        write_allowed: false, // Filesystem writes can be extended later if needed
        reason: read_result.reason || null
      }

      if (!read_result.allowed) {
        log(`Access denied to ${resource_path}: ${read_result.reason}`)
      }

      next()
    } catch (error) {
      log(`Error checking filesystem permission: ${error.message}`)
      next(error)
    }
  }
}

/**
 * Middleware to check thread access permissions
 *
 * @returns {Function} Express middleware function
 */
export const check_thread_permission = () => {
  return async (req, res, next) => {
    try {
      const user_public_key = req.user?.user_public_key || null
      const thread_id = req.params.thread_id

      if (!thread_id) {
        return next() // No specific thread, might be listing
      }

      // Convert thread ID to base-uri
      const resource_path = map_thread_id_to_base_uri(thread_id)
      log(`Checking thread permission for ${resource_path}`)

      // Check read permission
      const read_result = await check_user_permission({
        user_public_key,
        resource_path
      })

      // Check write permission (ownership)
      const is_owner = await validate_thread_ownership({
        thread_id,
        user_public_key
      })

      // Set structured access object
      req.access = {
        user_public_key,
        resource_path,
        read_allowed: !!read_result.allowed,
        write_allowed: !!is_owner,
        reason: read_result.reason || null
      }

      if (!read_result.allowed) {
        log(`Access denied to thread ${thread_id}: ${read_result.reason}`)
      }

      next()
    } catch (error) {
      log(`Error checking thread permission: ${error.message}`)
      next(error)
    }
  }
}

/**
 * Applies redaction to response data based on permissions
 *
 * @param {Object} req - Express request object
 * @param {any} data - Response data to potentially redact
 * @returns {any} Redacted or original data
 */
export const apply_response_redaction = (req, data) => {
  // Check if this is a filesystem route (baseUrl is set by the router)
  if (req.baseUrl === '/api/filesystem') {
    const request_path = req.path

    if (request_path === '/directory') {
      // Redact directory listing items based on per-item access
      if (data.items && Array.isArray(data.items)) {
        data.items = data.items.map((item) => {
          const can_read = item.access?.read_allowed !== false

          // Clean up internal fields
          delete item.access

          return can_read ? item : redact_file_info({ file_info: item })
        })
      }

      // Check directory-level access
      if (req.access && req.access.read_allowed === false) {
        return { ...data, is_redacted: true }
      }

      return data
    } else if (request_path === '/file') {
      // Redact file content based on access
      if (req.access && req.access.read_allowed === false) {
        return redact_file_content_response(data)
      }
      return data
    } else if (request_path === '/info') {
      // Redact file info based on access
      if (req.access && req.access.read_allowed === false) {
        return redact_file_info({ file_info: data })
      }
      return data
    }
  }

  // Thread routes: redact based on read access
  if ((req.baseUrl || req.originalUrl || '').includes('/api/threads')) {
    if (req.access && req.access.read_allowed === false) {
      if (data.thread_id) {
        // Single thread
        return redact_thread_data(data)
      } else if (Array.isArray(data)) {
        // Thread list
        return data.map((thread) => redact_thread_data(thread))
      }
    }
    return data
  }

  // Default: return data unchanged if no specific redaction needed
  return data
}

/**
 * Middleware to automatically apply response redaction when needed
 * Should be applied after permission checking middleware
 *
 * @returns {Function} Express middleware function
 */
export const apply_redaction_interceptor = () => {
  return (req, res, next) => {
    const original_json = res.json
    res.json = function (data) {
      // Apply redaction and cleanup if necessary
      const processed_data = apply_response_redaction(req, data)
      // Restore original function to avoid double-intercept
      res.json = original_json
      // Send the processed response
      return original_json.call(this, processed_data)
    }
    next()
  }
}
