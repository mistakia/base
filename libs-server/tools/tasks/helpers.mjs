import debug from 'debug'

import config from '#config'
import { read_task_from_filesystem } from '#libs-server/task/index.mjs'

const log = debug('tools:tasks')

/**
 * Shared helper functions to reduce code duplication and improve maintainability
 */
export const helpers = {
  /**
   * Resolves the user ID from parameters, context, or config
   * @param {Object} parameters Request parameters
   * @param {Object} context Request context
   * @returns {String} Resolved user ID
   */
  resolve_user_id(parameters, context = {}) {
    const user_id = parameters.user_id || context?.user_id || config.user_id

    if (!user_id) {
      throw new Error('User ID is required but could not be determined.')
    }

    return user_id
  },

  /**
   * Verifies a user has access to a task file
   * @param {String} base_uri Task base relative path to check
   * @param {String} user_id User ID to check (currently not used for filesystem access, but good for future)
   * @returns {Object|null} Task object if access is granted (or file exists), null otherwise
   */
  async verify_task_access(base_uri, user_id) {
    // For now, we read from filesystem. Git read might be needed later.
    const task_result = await read_task_from_filesystem({ base_uri })

    if (!task_result.success || !task_result.entity_properties) {
      log(`Task ${base_uri} not found or error reading it.`)
      return null
    }

    if (task_result.entity_properties.user_id !== user_id) {
      log(
        `Access denied: Task ${base_uri} user ${task_result.entity_properties.user_id} does not match requesting user ${user_id}`
      )
      return null
    }

    return task_result
  },

  /**
   * Creates a standard error response
   * @param {String} operation Name of the operation that failed
   * @param {String} message Error message
   * @returns {Object} Standardized error response
   */
  error_response(operation, message) {
    return {
      success: false,
      error: message || `Failed to ${operation}`
    }
  }
}

/**
 * Format a task for efficient token usage and better inference
 * @param {Object} task The task to format (from read_task_from_filesystem)
 * @returns {Object} Formatted task
 */
export function format_task(task) {
  if (!task) return null

  const { entity_properties, file_info } = task

  if (!entity_properties) return null

  const {
    title,
    description,
    status,
    priority,
    finish_by,
    started_at,
    entity_id,
    created_at,
    updated_at
  } = entity_properties

  return {
    base_uri: file_info?.base_uri,
    title,
    description,
    status,
    priority,
    finish_by,
    started_at,
    entity_id,
    created_at,
    updated_at
  }
}
