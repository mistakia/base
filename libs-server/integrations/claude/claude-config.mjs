/**
 * Claude Integration Configuration
 *
 * Configuration specific to Claude integration functionality.
 */

import { get_user_base_directory } from '#libs-server/base-uri/base-directory-registry.mjs'
import { get_current_machine_id } from '#libs-server/schedule/machine-identity.mjs'
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
 * Derive projects directories for every Claude account on the current machine.
 *
 * Reads `machine_registry[current_machine].claude_paths` to enumerate all
 * host-side locations where Claude sessions are stored on THIS machine:
 *
 * - `host_config_dir[namespace]` (macbook): sessions written by host-mode
 *   interactive claude
 * - `admin_data_dir[namespace]`: sessions written by the admin container
 * - `user_data_dirs[<user>][namespace]`: sessions written by per-user
 *   containers (e.g. storage:arrin)
 *
 * Falls back to the single default when no machine-specific claude_paths
 * are defined.
 *
 * @returns {string[]} Array of projects directory paths (~ unexpanded)
 */
export function get_all_claude_projects_directories() {
  const accounts_config = config.claude_accounts
  const machine_id = get_current_machine_id()
  const claude_paths = config.machine_registry?.[machine_id]?.claude_paths

  if (!accounts_config?.enabled || !claude_paths) {
    return [CLAUDE_DEFAULT_PATHS.claude_projects_directory]
  }

  const dirs = new Set()
  const append_projects = (dir) => {
    if (dir) dirs.add(`${dir.replace(/\/$/, '')}/projects`)
  }

  for (const dir of Object.values(claude_paths.host_config_dir || {})) {
    append_projects(dir)
  }
  for (const dir of Object.values(claude_paths.admin_data_dir || {})) {
    append_projects(dir)
  }
  for (const user_map of Object.values(claude_paths.user_data_dirs || {})) {
    for (const dir of Object.values(user_map || {})) {
      append_projects(dir)
    }
  }

  return dirs.size > 0
    ? [...dirs]
    : [CLAUDE_DEFAULT_PATHS.claude_projects_directory]
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
