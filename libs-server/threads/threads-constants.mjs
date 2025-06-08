import path from 'path'
import { get_user_base_directory } from '#libs-server/base-uri/index.mjs'

export const THREAD_CONTEXT_DIR = 'thread'
export const THREAD_DEFAULT_WORKFLOW_BASE_URI =
  'sys:system/workflow/default-workflow.md'

/**
 * Get the base directory for thread storage using the registry
 *
 * @returns {string} Thread base directory path
 */
export function get_thread_base_directory() {
  const base_directory = get_user_base_directory()
  return path.join(base_directory, THREAD_CONTEXT_DIR)
}

/**
 * Thread message role constants
 */
export const THREAD_MESSAGE_ROLE = {
  USER: 'user',
  THREAD_AGENT: 'assistant',
  SYSTEM: 'system'
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
