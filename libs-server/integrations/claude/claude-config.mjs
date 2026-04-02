/**
 * Claude Integration Configuration
 *
 * Configuration specific to Claude integration functionality.
 */

import { get_user_base_directory } from '#libs-server/base-uri/base-directory-registry.mjs'
import config from '#config'

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
 * Derive projects directories from all configured Claude accounts.
 * Reads `config.claude_accounts.accounts[].config_dir` and appends `/projects`.
 * Falls back to the single default when config is absent or disabled.
 *
 * @returns {string[]} Array of projects directory paths (with ~ unexpanded)
 */
export function get_all_claude_projects_directories() {
  const accounts = config.claude_accounts
  if (
    accounts?.enabled &&
    Array.isArray(accounts.accounts) &&
    accounts.accounts.length > 0
  ) {
    return accounts.accounts.map(
      (acct) => `${acct.config_dir.replace(/\/$/, '')}/projects`
    )
  }
  return [CLAUDE_DEFAULT_PATHS.claude_projects_directory]
}

/**
 * Get default configuration for Claude integration
 * @param {Object} overrides - Override specific options
 * @returns {Object} Configuration object
 */
export function get_claude_config(overrides = {}) {
  // When claude_projects_directory is explicitly overridden (e.g., --claude-projects-dir CLI flag),
  // use only that directory instead of multi-account discovery
  const claude_projects_directories =
    overrides.claude_projects_directories ||
    (overrides.claude_projects_directory
      ? [overrides.claude_projects_directory]
      : get_all_claude_projects_directories())

  return {
    claude_projects_directory: CLAUDE_DEFAULT_PATHS.claude_projects_directory,
    claude_projects_directories,
    user_base_directory: get_user_base_directory(),
    ...CLAUDE_DEFAULT_OPTIONS,
    ...overrides
  }
}

export default {
  CLAUDE_DEFAULT_PATHS,
  CLAUDE_DEFAULT_OPTIONS,
  get_claude_config,
  get_all_claude_projects_directories
}
