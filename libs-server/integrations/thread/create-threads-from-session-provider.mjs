/**
 * Create Threads from Session Provider
 *
 * Unified function for creating threads from any session provider.
 * This eliminates the need for provider-specific batch processing functions
 * and provides a clean, consistent interface across all providers.
 */

import debug from 'debug'
import { get_user_base_directory } from '#libs-server/base-uri/base-directory-registry.mjs'
import config from '#config'
import {
  create_thread_from_session,
  check_thread_exists,
  update_existing_thread
} from '#libs-server/integrations/thread/create-from-session.mjs'
import { build_timeline_from_session } from '#libs-server/integrations/thread/build-timeline-entries.mjs'
import { ClaudeSessionProvider } from '#libs-server/integrations/claude/claude-session-provider.mjs'
import { CursorSessionProvider } from '#libs-server/integrations/cursor/cursor-session-provider.mjs'
import { OpenAISessionProvider } from '#libs-server/integrations/openai/openai-session-provider.mjs'

const log = debug('integrations:thread:create-from-session-provider')

/**
 * Static map of session providers
 */
const SESSION_PROVIDER_MAP = {
  claude: ClaudeSessionProvider,
  cursor: CursorSessionProvider,
  openai: OpenAISessionProvider
}

/**
 * Create threads from a session provider
 *
 * @param {Object} params - Parameters object
 * @param {string} params.provider_name - Name of the session provider
 * @param {string} params.user_id - User ID for thread creation
 * @param {string} params.user_base_directory - Base directory for user data
 * @param {boolean} params.allow_updates - Allow updating existing threads
 * @param {boolean} params.verbose - Enable verbose logging
 * @param {Object} params.provider_options - Provider-specific options passed to find_sessions
 * @returns {Promise<Object>} Results object with created, updated, skipped, and failed arrays
 */
export const create_threads_from_session_provider = async ({
  provider_name,
  user_id = config.user_id,
  user_base_directory = get_user_base_directory(),
  allow_updates = false,
  verbose = false,
  provider_options = {}
}) => {
  if (!provider_name) {
    throw new Error('provider_name is required')
  }

  const ProviderClass = SESSION_PROVIDER_MAP[provider_name]
  if (!ProviderClass) {
    const available = Object.keys(SESSION_PROVIDER_MAP).join(', ')
    throw new Error(
      `Session provider '${provider_name}' not found. Available: ${available}`
    )
  }

  const session_provider = new ProviderClass()

  log(`Creating threads using ${session_provider.name} provider`)

  // Find sessions using provider-specific logic
  const raw_sessions = await session_provider.find_sessions(provider_options)

  if (raw_sessions.length === 0) {
    log(`No sessions found from ${session_provider.name} provider`)
    return create_empty_results_object()
  }

  // Filter to only valid sessions
  const { valid: valid_sessions, invalid: invalid_sessions } =
    session_provider.filter_valid_sessions(raw_sessions)

  if (invalid_sessions.length > 0) {
    log(
      `Filtered out ${invalid_sessions.length} invalid sessions from ${session_provider.name}`
    )
  }

  if (valid_sessions.length === 0) {
    log(`No valid sessions found from ${session_provider.name} provider`)
    return create_empty_results_object()
  }

  log(
    `Processing ${valid_sessions.length} valid sessions from ${session_provider.name}`
  )

  // Process each session individually
  const results = create_empty_results_object()

  for (const raw_session of valid_sessions) {
    try {
      const session_result = await process_single_session({
        raw_session,
        session_provider,
        user_id,
        user_base_directory,
        allow_updates,
        verbose
      })

      // Add result to appropriate category
      results[session_result.status].push(session_result.data)

      if (verbose) {
        log_session_result(session_result, session_provider.name)
      }
    } catch (error) {
      const session_id = session_provider.get_session_id(raw_session)
      log(`Failed to process session ${session_id}: ${error.message}`)

      results.failed.push({
        session_id,
        error: error.message,
        provider: session_provider.name
      })
    }
  }

  // Log summary
  const summary = create_results_summary(results, valid_sessions.length)
  log(
    `${session_provider.name} processing complete: ${summary.created} created, ` +
      `${summary.updated} updated, ${summary.skipped} skipped, ${summary.failed} failed`
  )

  return {
    ...results,
    summary,
    invalid_sessions_count: invalid_sessions.length
  }
}

/**
 * Process a single session through the complete workflow
 * @private
 */
const process_single_session = async ({
  raw_session,
  session_provider,
  user_id,
  user_base_directory,
  allow_updates,
  verbose
}) => {
  const session_id = session_provider.get_session_id(raw_session)

  // Check if thread already exists
  const { exists, thread_id, thread_dir } = await check_thread_exists(
    session_id,
    session_provider.name,
    user_base_directory
  )

  if (exists) {
    if (allow_updates) {
      return await update_existing_session_thread({
        raw_session,
        session_provider,
        thread_id,
        thread_dir,
        session_id
      })
    } else {
      return {
        status: 'skipped',
        data: {
          session_id,
          thread_id,
          reason: 'thread_already_exists'
        }
      }
    }
  }

  // Create new thread
  return await create_new_session_thread({
    raw_session,
    session_provider,
    user_id,
    user_base_directory,
    session_id
  })
}

/**
 * Create new thread from session
 * @private
 */
const create_new_session_thread = async ({
  raw_session,
  session_provider,
  user_id,
  user_base_directory,
  session_id
}) => {
  // Normalize session just-in-time
  const normalized_session = session_provider.normalize_session(raw_session)

  // Create thread with direct access to raw data
  const thread_result = await create_thread_from_session({
    normalized_session,
    user_id,
    user_base_directory,
    inference_provider: session_provider.get_inference_provider(),
    models: session_provider.get_models_from_session(raw_session),
    raw_session_data: raw_session // Direct access, no mapping needed
  })

  // Build timeline entries
  const timeline_result = await build_timeline_from_session(
    normalized_session,
    thread_result
  )

  return {
    status: 'created',
    data: {
      session_id,
      thread_id: thread_result.thread_id,
      thread_dir: thread_result.thread_dir,
      timeline_entries: timeline_result.entry_count
    }
  }
}

/**
 * Update existing thread with new session data
 * @private
 */
const update_existing_session_thread = async ({
  raw_session,
  session_provider,
  thread_id,
  thread_dir,
  session_id
}) => {
  // Normalize session just-in-time
  const normalized_session = session_provider.normalize_session(raw_session)

  // Update existing thread
  const update_result = await update_existing_thread(normalized_session, {
    thread_id,
    thread_dir,
    raw_session_data: raw_session
  })

  return {
    status: 'updated',
    data: {
      session_id,
      thread_id,
      thread_dir,
      new_entries_added: update_result.new_entries_added,
      total_entries: update_result.total_entries
    }
  }
}

/**
 * Create empty results object
 * @private
 */
const create_empty_results_object = () => ({
  created: [],
  updated: [],
  skipped: [],
  failed: []
})

/**
 * Create results summary
 * @private
 */
const create_results_summary = (results, total_sessions) => {
  const created = results.created.length
  const updated = results.updated.length
  const skipped = results.skipped.length
  const failed = results.failed.length

  const success_rate =
    total_sessions > 0
      ? (((created + updated) / total_sessions) * 100).toFixed(1)
      : 0

  return {
    total: total_sessions,
    created,
    updated,
    skipped,
    failed,
    success_rate
  }
}

/**
 * Log session processing result
 * @private
 */
const log_session_result = (session_result, provider_name) => {
  const { status, data } = session_result
  const session_id = data.session_id

  switch (status) {
    case 'created':
      log(
        `✓ Created thread ${data.thread_id} for ${provider_name} session ${session_id}`
      )
      break
    case 'updated':
      log(
        `↻ Updated thread ${data.thread_id} for ${provider_name} session ${session_id} (${data.new_entries_added} new entries)`
      )
      break
    case 'skipped':
      log(`↷ Skipped ${provider_name} session ${session_id} (${data.reason})`)
      break
    default:
      log(
        `? Unknown status ${status} for ${provider_name} session ${session_id}`
      )
  }
}
