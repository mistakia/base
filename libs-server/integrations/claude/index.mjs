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
import { build_claude_attribution_resolver } from './claude-attribution-resolver.mjs'
import { create_threads_from_session_provider } from '#libs-server/integrations/thread/create-threads-from-session-provider.mjs'
import config from '#config'

const log = debug('integrations:claude')

// Export the session provider class
export { ClaudeSessionProvider }

// Export configuration helpers
export { get_claude_config }

// Export parsing utilities
export { parse_all_claude_files, get_session_summary }

/**
 * Import Claude sessions to Base threads
 *
 * Uses streaming to process sessions one at a time, avoiding memory issues
 * with large session sets.
 */
export const import_claude_sessions_to_threads = async (options = {}) => {
  const config = get_claude_config(options)

  try {
    log('Starting Claude session import (streaming)')

    // For dry_run, we need to count sessions without processing them
    if (config.dry_run) {
      const provider = new ClaudeSessionProvider()
      let session_count = 0
      let valid_count = 0
      let invalid_count = 0

      for await (const session of provider.stream_sessions({
        claude_projects_directory: config.claude_projects_directory,
        claude_projects_directories: config.claude_projects_directories,
        filter_sessions: config.filter_sessions,
        session_id: options.session_id,
        session_file: options.session_file,
        from_date: config.from_date,
        to_date: config.to_date
      })) {
        session_count++
        const validation = provider.validate_session(session)
        if (validation.valid) {
          valid_count++
        } else {
          invalid_count++
        }
      }

      return {
        dry_run: true,
        sessions_found: session_count,
        valid_sessions: valid_count,
        invalid_sessions: invalid_count
      }
    }

    // Build per-session execution resolver from the machine registry.
    // Only wired when no explicit session_file override is set (ad-hoc single-file
    // imports bypass the resolver and rely on null attribution).
    const execution_resolver = !options.session_file
      ? build_claude_attribution_resolver({
          machine_registry: config.machine_registry
        })
      : null

    // Create threads using unified provider system with streaming
    // Agent sessions are attached during streaming, merged during processing
    // Warm/initialization agents are excluded during streaming
    const results = await create_threads_from_session_provider({
      provider_name: 'claude',
      user_base_directory: config.user_base_directory,
      verbose: config.verbose,
      allow_updates: config.allow_updates,
      merge_agents: true,
      include_warm_agents: false,
      provider_options: {
        claude_projects_directory: config.claude_projects_directory,
        claude_projects_directories: config.claude_projects_directories,
        filter_sessions: config.filter_sessions,
        session_id: options.session_id,
        session_file: options.session_file,
        from_date: config.from_date,
        to_date: config.to_date
      },
      execution_resolver,
      ...(options.known_thread_id
        ? { known_thread_id: options.known_thread_id }
        : {}),
      bulk_import: options.bulk_import === true
    })

    const sessions_processed =
      results.summary?.total ??
      results.created.length +
        results.updated.length +
        results.skipped.length +
        results.failed.length

    return {
      sessions_found:
        sessions_processed + (results.invalid_sessions_count || 0),
      valid_sessions: sessions_processed,
      invalid_sessions: results.invalid_sessions_count || 0,
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
      claude_projects_directories: config.claude_projects_directories,
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
