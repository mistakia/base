/**
 * Claude Integration Configuration
 *
 * Configuration specific to Claude integration functionality.
 */

import { get_user_base_directory } from '#libs-server/base-uri/base-directory-registry.mjs'

/**
 * Claude-specific default paths
 */
export const CLAUDE_DEFAULT_PATHS = {
  // Claude Code projects directory
  claude_projects_directory: '~/.claude/projects'
}

/**
 * Claude-specific default options
 */
export const CLAUDE_DEFAULT_OPTIONS = {
  // Import options
  dry_run: false,
  verbose: false,
  allow_updates: false,

  // Filtering options
  filter_sessions: null,

  // Date filtering
  from_date: null,
  to_date: null
}

/**
 * Get default configuration for Claude integration
 * @param {Object} overrides - Override specific options
 * @returns {Object} Configuration object
 */
export function get_claude_config(overrides = {}) {
  return {
    claude_projects_directory: CLAUDE_DEFAULT_PATHS.claude_projects_directory,
    user_base_directory: get_user_base_directory(),
    ...CLAUDE_DEFAULT_OPTIONS,
    ...overrides
  }
}

export default {
  CLAUDE_DEFAULT_PATHS,
  CLAUDE_DEFAULT_OPTIONS,
  get_claude_config
}
