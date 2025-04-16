/**
 * Thread status constants
 */
export const THREAD_STATUS = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  TERMINATED: 'terminated'
}

/**
 * Validates if a thread state is valid
 *
 * @param {string} state - The state to validate
 * @returns {boolean} - True if valid, false otherwise
 */
export const is_valid_thread_state = (state) => {
  return Object.values(THREAD_STATUS).includes(state)
}

/**
 * Validates thread state and throws an error if invalid
 *
 * @param {string} state - The state to validate
 * @throws {Error} If state is invalid
 */
export const validate_thread_state = (state) => {
  if (!is_valid_thread_state(state)) {
    throw new Error(
      `Invalid thread state: ${state}. Must be one of: ${Object.values(THREAD_STATUS).join(', ')}`
    )
  }
}
