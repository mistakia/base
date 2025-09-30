/**
 * Claude Integration - Clean Provider Architecture
 *
 * Streamlined exports focused on the new session provider pattern.
 * No backward compatibility - use ClaudeSessionProvider directly.
 */

import debug from 'debug'
import { ClaudeSessionProvider } from './claude-session-provider.mjs'
import { get_claude_config } from './claude-config.mjs'
import { parse_all_claude_files, get_session_summary } from './parse-jsonl.mjs'
import { create_threads_from_session_provider } from '#libs-server/integrations/thread/create-threads-from-session-provider.mjs'

const log = debug('integrations:claude')

// Export the session provider class
export { ClaudeSessionProvider }

// Export configuration helpers
export { get_claude_config }

// Export parsing utilities
export { parse_all_claude_files, get_session_summary }

/**
 * Import Claude sessions to Base threads
 */
export const import_claude_sessions_to_threads = async (options = {}) => {
  const config = get_claude_config(options)
  const provider = new ClaudeSessionProvider()

  try {
    log('Starting Claude session import')

    // Find sessions using provider
    const claude_sessions = await provider.find_sessions({
      claude_projects_directory: config.claude_projects_directory,
      filter_sessions: config.filter_sessions,
      session_id: options.session_id,
      session_file: options.session_file
    })

    log(`Found ${claude_sessions.length} Claude sessions`)

    // Validate sessions
    const { valid: valid_sessions, invalid: invalid_sessions } =
      provider.filter_valid_sessions(claude_sessions)
    log(
      `Validation: ${valid_sessions.length} valid, ${invalid_sessions.length} invalid`
    )

    // If session_file or session_id was specified and no valid sessions found, return early
    // to prevent fallback to scanning all files
    if (
      (options.session_file || options.session_id) &&
      valid_sessions.length === 0
    ) {
      const identifier = options.session_file || options.session_id
      log(
        `No valid sessions found for specified ${options.session_file ? 'file' : 'session ID'}: ${identifier}`
      )
      return {
        sessions_found: claude_sessions.length,
        valid_sessions: 0,
        invalid_sessions: invalid_sessions.length,
        threads_created: 0,
        threads_updated: 0,
        threads_failed: 0,
        threads_skipped: 0,
        success_rate: '0.0',
        results: {
          created: [],
          updated: [],
          failed: [],
          skipped: []
        }
      }
    }

    if (config.dry_run) {
      return {
        dry_run: true,
        sessions_found: claude_sessions.length,
        valid_sessions: valid_sessions.length,
        invalid_sessions: invalid_sessions.length
      }
    }

    // Create threads using unified provider system
    const results = await create_threads_from_session_provider({
      provider_name: 'claude',
      user_base_directory: config.user_base_directory,
      verbose: config.verbose,
      allow_updates: config.allow_updates,
      provider_options: {
        claude_sessions: valid_sessions,
        // Pass through session_id and session_file to ensure they're respected
        // even when valid_sessions is empty (e.g., when the session is invalid)
        session_id: options.session_id,
        session_file: options.session_file,
        claude_projects_directory: options.claude_projects_directory
      }
    })

    return {
      sessions_found: claude_sessions.length,
      valid_sessions: valid_sessions.length,
      invalid_sessions: invalid_sessions.length,
      threads_created: results.created.length,
      threads_updated: results.updated.length,
      threads_failed: results.failed.length,
      threads_skipped: results.skipped.length,
      success_rate: results.summary?.success_rate,
      results
    }
  } catch (error) {
    log(`Claude import failed: ${error.message}`)
    throw error
  }
}

/**
 * List Claude sessions
 */
export const list_claude_sessions = async (options = {}) => {
  const config = get_claude_config(options)
  const provider = new ClaudeSessionProvider()

  try {
    const sessions = await provider.find_sessions({
      claude_projects_directory: config.claude_projects_directory,
      filter_sessions: config.filter_sessions
    })

    return sessions.map((session) => {
      const summary = get_session_summary(session)
      return {
        session_id: session.session_id,
        entry_count: summary.entry_count,
        duration_minutes: summary.duration_minutes,
        working_directory: summary.working_directory,
        claude_version: summary.claude_version,
        file_source: summary.file_source
      }
    })
  } catch (error) {
    log(`Failed to list Claude sessions: ${error.message}`)
    throw error
  }
}
