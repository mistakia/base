/**
 * Thread status constants
 */
export const THREAD_STATUS = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  TERMINATED: 'terminated'
}

/**
 * Default tools available to threads
 */
export const DEFAULT_THREAD_TOOLS = [
  'task_get',
  'list_tasks',
  'task_create',
  'task_update',
  'task_delete',
  'file_read',
  'file_list',
  'file_write',
  'file_delete',
  'file_diff',
  'file_search',
  'message_notify_creator',
  'message_ask_creator'
]

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
