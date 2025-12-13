/**
 * Response redaction middleware
 *
 * Applies content redaction based on permission check results stored in req.access.
 * Permission checking is handled by the permission module.
 */

import {
  redact_file_info,
  redact_file_content_response,
  redact_thread_data
} from './content-redactor.mjs'

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
