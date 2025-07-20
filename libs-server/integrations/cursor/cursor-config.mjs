/**
 * Cursor Integration Configuration
 *
 * Configuration specific to Cursor integration functionality.
 */

import { get_user_base_directory } from '#libs-server/base-uri/base-directory-registry.mjs'

/**
 * Cursor-specific default paths
 */
export const CURSOR_DEFAULT_PATHS = {
  // Cursor database path
  cursor_db_path:
    '~/Library/Application Support/Cursor/User/globalStorage/state.vscdb'
}

/**
 * Cursor-specific default options
 */
export const CURSOR_DEFAULT_OPTIONS = {
  // Import options
  dry_run: false,
  verbose: false,
  allow_updates: false,

  // Filtering options
  filter_conversations: null,

  // Date filtering
  from_date: null,
  to_date: null
}

export const CURSOR_THREAD_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'

/**
 * Get default configuration for Cursor integration
 * @param {Object} overrides - Override specific options
 * @returns {Object} Configuration object
 */
export function get_cursor_config(overrides = {}) {
  return {
    cursor_data_path: CURSOR_DEFAULT_PATHS.cursor_db_path,
    user_base_directory: get_user_base_directory(),
    ...CURSOR_DEFAULT_OPTIONS,
    ...overrides
  }
}

export default {
  CURSOR_DEFAULT_PATHS,
  CURSOR_DEFAULT_OPTIONS,
  get_cursor_config
}
