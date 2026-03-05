/**
 * Thread state constants
 */
export const THREAD_STATE = {
  ACTIVE: 'active',
  ARCHIVED: 'archived'
}

/**
 * Thread archive reason constants
 */
export const ARCHIVE_REASON = {
  COMPLETED: 'completed',
  USER_ABANDONED: 'user_abandoned'
}

/**
 * Validates if a thread state is valid
 *
 * @param {string} thread_state - The state to validate
 * @returns {boolean} - True if valid, false otherwise
 */
export const is_valid_thread_state = (thread_state) => {
  return Object.values(THREAD_STATE).includes(thread_state)
}

/**
 * Validates thread state and throws an error if invalid
 *
 * @param {string} thread_state - The state to validate
 * @throws {Error} If state is invalid
 */
export const validate_thread_state = (thread_state) => {
  if (!is_valid_thread_state(thread_state)) {
    throw new Error(
      `Invalid thread state: ${thread_state}. Must be one of: ${Object.values(THREAD_STATE).join(', ')}`
    )
  }
}

/**
 * Validates if an archive reason is valid
 *
 * @param {string} archive_reason - The archive reason to validate
 * @returns {boolean} - True if valid, false otherwise
 */
export const is_valid_archive_reason = (archive_reason) => {
  return Object.values(ARCHIVE_REASON).includes(archive_reason)
}

/**
 * Validates archive reason and throws an error if invalid
 *
 * @param {string} archive_reason - The archive reason to validate
 * @throws {Error} If archive reason is invalid
 */
export const validate_archive_reason = (archive_reason) => {
  if (!is_valid_archive_reason(archive_reason)) {
    throw new Error(
      `Invalid archive reason: ${archive_reason}. Must be one of: ${Object.values(ARCHIVE_REASON).join(', ')}`
    )
  }
}
