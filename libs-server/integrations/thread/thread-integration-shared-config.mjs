/**
 * Shared Integration Configuration
 *
 * Common utilities and shared configuration for integrations.
 * Provider-specific configuration is now in the provider-config directory.
 */

import config from '#config'
import { readFileSync } from 'fs'
import { join } from 'path'
import { get_user_base_directory } from '#libs-server/base-uri/base-directory-registry.mjs'

/**
 * Constants for raw data timestamp formats
 */
export const RAW_DATA_TIMESTAMP_FORMAT = {
  DATE: 'date', // YYYY-MM-DD format, overwrites on same day
  DATETIME: 'datetime' // Full timestamp format, creates unique files
}

/**
 * Default raw data storage configuration
 */
export const RAW_DATA_STORAGE_DEFAULTS = {
  timestamp_format: RAW_DATA_TIMESTAMP_FORMAT.DATE
}

/**
 * Get raw data storage configuration
 * @returns {Object} Raw data storage configuration
 */
export function get_raw_data_storage_config() {
  const user_config = config.thread_integration?.raw_data_storage || {}
  return {
    ...RAW_DATA_STORAGE_DEFAULTS,
    ...user_config
  }
}

/**
 * Generate timestamp for raw data files based on configured format
 * @param {string} format - Timestamp format ('date' or 'datetime')
 * @returns {string} Formatted timestamp string
 */
export function get_timestamp_for_raw_data(format) {
  const now = new Date()

  if (format === RAW_DATA_TIMESTAMP_FORMAT.DATE) {
    // Return YYYY-MM-DD format
    return now.toISOString().split('T')[0]
  }

  // Default to full datetime format (backward compatible)
  return now.toISOString().replace(/[:.]/g, '-')
}

/**
 * Shared default options for all integrations
 */
export const SHARED_DEFAULT_OPTIONS = {
  // Import options
  dry_run: false,
  verbose: false,
  allow_updates: false,

  // Filtering options
  filter_sessions: null,
  filter_conversations: null,

  // Date filtering
  from_date: null,
  to_date: null
}

/**
 * Load thread blacklist from user-base directory
 * @param {string} user_base_directory - User base directory path
 * @returns {Object|null} Blacklist object or null if file doesn't exist
 */
export function load_thread_blacklist(user_base_directory = null) {
  try {
    const base_dir = user_base_directory || get_user_base_directory()
    const blacklist_path = join(base_dir, '.claude', 'thread-blacklist.json')

    const blacklist_content = readFileSync(blacklist_path, 'utf-8')
    return JSON.parse(blacklist_content)
  } catch (error) {
    // File doesn't exist or can't be read - return null (no blacklist)
    if (error.code === 'ENOENT') {
      return null
    }
    // Other errors - log but don't fail
    console.warn(`Warning: Could not load thread blacklist: ${error.message}`)
    return null
  }
}

/**
 * Check if session/thread is blacklisted
 * @param {string} session_id - Session ID to check
 * @param {string} thread_id - Thread ID to check (optional)
 * @param {Object} blacklist - Blacklist object
 * @returns {boolean} True if blacklisted
 */
export function is_blacklisted(session_id, thread_id = null, blacklist = null) {
  if (!blacklist) {
    return false
  }

  // Check thread_id array (covers both session_ids and thread_ids for consistency)
  if (blacklist.thread_id && Array.isArray(blacklist.thread_id)) {
    if (blacklist.thread_id.includes(session_id)) {
      return true
    }
    if (thread_id && blacklist.thread_id.includes(thread_id)) {
      return true
    }
  }

  // Check patterns (regex matching)
  if (blacklist.patterns && Array.isArray(blacklist.patterns)) {
    for (const pattern of blacklist.patterns) {
      try {
        const regex = new RegExp(pattern)
        if (regex.test(session_id) || (thread_id && regex.test(thread_id))) {
          return true
        }
      } catch (error) {
        // Invalid regex pattern - skip it
        console.warn(`Warning: Invalid blacklist pattern: ${pattern}`)
      }
    }
  }

  return false
}

/**
 * Build filter function for date/session filtering with blacklist support
 * @param {Object} options - Filter options
 * @param {string} options.user_base_directory - User base directory for blacklist loading
 * @returns {Function|null} Filter function or null if no filtering needed
 */
export function build_session_filter(options = {}) {
  const { session_id, from_date, to_date, max_entries, user_base_directory } =
    options

  // Load blacklist if user_base_directory is provided
  const blacklist = user_base_directory
    ? load_thread_blacklist(user_base_directory)
    : null

  // If no filters and no blacklist, return null
  if (!session_id && !from_date && !to_date && !max_entries && !blacklist) {
    return null
  }

  return (session) => {
    // Check blacklist first
    if (blacklist && is_blacklisted(session.session_id, null, blacklist)) {
      return false
    }

    // Filter by specific session ID
    if (session_id && session.session_id !== session_id) {
      return false
    }

    // Filter by date range
    if (from_date || to_date) {
      const session_start =
        session.metadata?.start_time ||
        session.created_at ||
        session.entries?.[0]?.timestamp
      if (session_start) {
        const start_date = new Date(session_start)
        if (from_date && start_date < new Date(from_date)) {
          return false
        }
        if (to_date && start_date > new Date(to_date + 'T23:59:59')) {
          return false
        }
      }
    }

    // Filter by entry count
    if (
      max_entries &&
      (session.entries?.length || session.messages?.length) > max_entries
    ) {
      return false
    }

    return true
  }
}

export default {
  SHARED_DEFAULT_OPTIONS,
  build_session_filter,
  load_thread_blacklist,
  is_blacklisted
}
