/**
 * Shared watcher state module.
 *
 * Provides a central location for watcher status tracking, avoiding
 * circular imports between server.mjs and health route.
 */

// Watcher initialization state
const watcher_status = {
  thread_watcher: 'pending',
  file_subscription_watcher: 'pending',
  git_status_watcher: 'pending',
  entity_file_watcher: 'pending'
}

/**
 * Get current watcher status.
 * @returns {Object} Copy of watcher status
 */
export function get_watcher_status() {
  return { ...watcher_status }
}

/**
 * Update a specific watcher's status.
 * @param {string} watcher_name - Key in watcher_status
 * @param {string} status - New status value (pending/ready/failed/disabled)
 */
export function set_watcher_status(watcher_name, status) {
  if (watcher_name in watcher_status) {
    watcher_status[watcher_name] = status
  }
}
