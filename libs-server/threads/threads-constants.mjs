import path from 'path'
import config from '#config'

export const THREAD_CONTEXT_DIR = 'thread'
export const THREAD_DEFAULT_WORKFLOW_BASE_RELATIVE_PATH =
  'system/workflow/default-workflow.md'

/**
 * Get the base directory for thread storage
 *
 * @param {Object} params Parameters
 * @param {string} [params.user_base_directory] Custom user base directory
 * @returns {string} Thread base directory path
 */
export function get_thread_base_directory({
  user_base_directory = config.user_base_directory
} = {}) {
  return path.join(user_base_directory, THREAD_CONTEXT_DIR)
}

/**
 * Thread message role constants
 */
export const THREAD_MESSAGE_ROLE = {
  USER: 'USER',
  THREAD_AGENT: 'THREAD_AGENT',
  SYSTEM: 'SYSTEM'
}

/**
 * Valid thread message role values
 */
export const VALID_THREAD_MESSAGE_ROLES = Object.values(THREAD_MESSAGE_ROLE)

/**
 * Validate that a message role is valid
 *
 * @param {string} role Role to validate
 * @returns {boolean} True if valid
 * @throws {Error} If role is invalid
 */
export function validate_thread_message_role(role) {
  if (!VALID_THREAD_MESSAGE_ROLES.includes(role)) {
    throw new Error(
      `Invalid thread message role: ${role}. Must be one of: ${VALID_THREAD_MESSAGE_ROLES.join(', ')}`
    )
  }
  return true
}
