import path from 'path'
import { get_user_base_directory } from '#libs-server/base-uri/index.mjs'

// Thread state constants
export const THREAD_STATE = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  TERMINATED: 'terminated'
}

// Valid thread state values
export const VALID_THREAD_STATES = Object.values(THREAD_STATE)

// Validate that a thread state is valid
export function validate_thread_state(thread_state) {
  if (!VALID_THREAD_STATES.includes(thread_state)) {
    throw new Error(
      `Invalid thread state: ${thread_state}. Must be one of: ${VALID_THREAD_STATES.join(', ')}`
    )
  }
  return true
}

export const THREAD_CONTEXT_DIR = 'thread'

/**
 * Get the base directory for thread storage using the registry
 *
 * @returns {string} Thread base directory path
 */
export function get_thread_base_directory({ user_base_directory } = {}) {
  const base_directory = user_base_directory || get_user_base_directory()
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
