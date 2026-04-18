import path from 'path'
import os from 'os'
import { get_user_base_directory } from '#libs-server/base-uri/index.mjs'

// Roots considered safe for thread I/O under NODE_ENV=test. Includes the
// platform tmpdir and the literal /tmp / /private/tmp paths (macOS symlink)
// because config/config-test.json points user_base_directory at /tmp/...
const TEST_SAFE_ROOTS = [
  os.tmpdir(),
  '/tmp',
  '/private/tmp',
  '/var/folders'
]

const is_under_safe_test_root = (absolute_path) => {
  const resolved = path.resolve(absolute_path)
  return TEST_SAFE_ROOTS.some((root) => {
    const root_resolved = path.resolve(root)
    return (
      resolved === root_resolved ||
      resolved.startsWith(root_resolved + path.sep)
    )
  })
}

// Thread state constants
export const THREAD_STATE = {
  ACTIVE: 'active',
  ARCHIVED: 'archived'
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

// Thread archive reason constants
export const ARCHIVE_REASON = {
  COMPLETED: 'completed',
  USER_ABANDONED: 'user_abandoned'
}

// Valid archive reason values
export const VALID_ARCHIVE_REASONS = Object.values(ARCHIVE_REASON)

// Validate that an archive reason is valid
export function validate_archive_reason(archive_reason) {
  if (!VALID_ARCHIVE_REASONS.includes(archive_reason)) {
    throw new Error(
      `Invalid archive reason: ${archive_reason}. Must be one of: ${VALID_ARCHIVE_REASONS.join(', ')}`
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

  // Hard guard: when NODE_ENV=test, thread/ must live under a tmp root.
  // A test that tries to read or write a production thread/ directory is a
  // bug -- it will leak synthetic fixtures into real history. Refuse loudly
  // at the boundary instead of silently corrupting user data.
  if (process.env.NODE_ENV === 'test' && !is_under_safe_test_root(base_directory)) {
    throw new Error(
      `Refusing to resolve thread base directory under NODE_ENV=test: ` +
        `${base_directory} is not under a tmp root (${TEST_SAFE_ROOTS.join(', ')}). ` +
        `Tests must point user_base_directory at a tmp sandbox (see tests/utils/setup-test-directories.mjs).`
    )
  }

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
