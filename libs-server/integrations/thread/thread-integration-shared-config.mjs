/**
 * Shared Integration Configuration
 *
 * Common utilities and shared configuration for integrations.
 * Provider-specific configuration is now in the provider-config directory.
 */

import config from '#config'

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
 * Build filter function for date/session filtering
 * @param {Object} options - Filter options
 * @returns {Function|null} Filter function or null if no filtering needed
 */
export function build_session_filter(options = {}) {
  const { session_id, from_date, to_date, max_entries } = options

  if (!session_id && !from_date && !to_date && !max_entries) {
    return null
  }

  return (session) => {
    // Filter by specific session ID
    if (session_id && session.session_id !== session_id) {
      return false
    }

    // Filter by date range
    if (from_date || to_date) {
      const session_start = session.metadata?.start_time || session.created_at
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
  build_session_filter
}
