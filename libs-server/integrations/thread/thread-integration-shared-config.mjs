/**
 * Shared Integration Configuration
 *
 * Common utilities and shared configuration for integrations.
 * Provider-specific configuration is now in the provider-config directory.
 */

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
