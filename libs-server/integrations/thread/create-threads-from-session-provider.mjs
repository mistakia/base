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
import {
  group_sessions_with_agents,
  is_agent_session
} from '#libs-server/integrations/claude/claude-session-helpers.mjs'
import { merge_and_sequence_agent_sessions } from '#libs-server/integrations/claude/merge-agent-sessions.mjs'

const log = debug('integrations:thread:create-from-session-provider')
const log_debug = debug(
  'integrations:thread:create-from-session-provider:debug'
)

/**
 * Calculate success rate for thread operations
 * Includes created, updated, and skipped sessions as successful operations
 *
 * @param {Object} params - Parameters object
 * @param {number} params.created - Number of created threads
 * @param {number} params.updated - Number of updated threads
 * @param {number} params.skipped - Number of skipped sessions
 * @param {number} params.total_sessions - Total number of sessions processed
 * @returns {string} Success rate as percentage string (e.g., "85.5")
 */
const calculate_success_rate = ({
  created,
  updated,
  skipped,
  total_sessions
}) => {
  if (total_sessions === 0) {
    return '0.0'
  }

  // Include skipped sessions as successful operations since they were processed correctly
  const successful_operations = created + updated + skipped
  const rate = (successful_operations / total_sessions) * 100

  return rate.toFixed(1)
}

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
 * @param {string} params.user_public_key - User public key for thread creation
 * @param {string} params.user_base_directory - Base directory for user data
 * @param {boolean} params.allow_updates - Allow updating existing threads
 * @param {boolean} params.verbose - Enable verbose logging
 * @param {boolean} params.merge_agents - Merge agent sessions into parent (default: true for Claude)
 * @param {boolean} params.include_warm_agents - Include warm/initialization agents (default: false)
 * @param {Object} params.provider_options - Provider-specific options passed to find_sessions
 * @returns {Promise<Object>} Results object with created, updated, skipped, and failed arrays
 */
export const create_threads_from_session_provider = async ({
  provider_name,
  user_public_key = config.user_public_key,
  user_base_directory = get_user_base_directory(),
  allow_updates = false,
  verbose = false,
  merge_agents = true,
  include_warm_agents = false,
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

  // For Claude provider, handle agent session merging
  let sessions_to_process = valid_sessions
  let agents_merged = 0
  let warm_agents_excluded = 0

  if (provider_name === 'claude' && merge_agents) {
    const grouping_result = group_sessions_with_agents({
      sessions: valid_sessions,
      include_warm_agents
    })

    warm_agents_excluded = grouping_result.warm_agents_excluded

    // Process grouped sessions (parent + agents merged)
    const merged_sessions = []

    for (const [
      session_id,
      { parent_session, agent_sessions }
    ] of grouping_result.grouped) {
      const merged_session = merge_and_sequence_agent_sessions({
        parent_session,
        agent_sessions
      })
      merged_sessions.push(merged_session)
      agents_merged += agent_sessions.length

      if (verbose) {
        log_debug(
          `Merged ${agent_sessions.length} agents into session ${session_id}`
        )
      }
    }

    // Combine merged sessions with standalone sessions
    sessions_to_process = [
      ...merged_sessions,
      ...grouping_result.standalone_sessions
    ]

    // Note: orphan_agents are not processed as standalone threads
    // They referenced parents that weren't found in this batch

    log(
      `Agent merging: ${agents_merged} agents merged, ${warm_agents_excluded} warm agents excluded, ${grouping_result.orphan_agents.length} orphans skipped`
    )
  }

  log(
    `Processing ${sessions_to_process.length} sessions from ${session_provider.name}`
  )

  // Process each session individually
  const results = create_empty_results_object()

  for (const raw_session of sessions_to_process) {
    // Skip agent sessions that weren't merged (when merge_agents is false)
    if (!merge_agents && is_agent_session({ session: raw_session })) {
      results.skipped.push({
        session_id: raw_session.session_id,
        reason: 'agent_session_not_merged'
      })
      continue
    }

    try {
      const session_result = await process_single_session({
        raw_session,
        session_provider,
        user_public_key,
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
  const summary = create_results_summary(results, sessions_to_process.length)
  log(
    `${session_provider.name} processing complete: ${summary.created} created, ` +
      `${summary.updated} updated, ${summary.skipped} skipped, ${summary.failed} failed`
  )

  return {
    ...results,
    summary,
    invalid_sessions_count: invalid_sessions.length,
    agents_merged,
    warm_agents_excluded
  }
}

/**
 * Process a single session through the complete workflow
 * @private
 */
const process_single_session = async ({
  raw_session,
  session_provider,
  user_public_key,
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
    user_public_key,
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
  user_public_key,
  user_base_directory,
  session_id
}) => {
  // Normalize session just-in-time
  const normalized_session = session_provider.normalize_session(raw_session)

  // Create thread with direct access to raw data
  const thread_result = await create_thread_from_session({
    normalized_session,
    user_public_key,
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
      total_entries: update_result.total_entries,
      files_modified: update_result.files_modified
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

  const success_rate = calculate_success_rate({
    created,
    updated,
    skipped,
    total_sessions
  })

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
      log_debug(
        `Created thread ${data.thread_id} for ${provider_name} session ${session_id}`
      )
      break
    case 'updated':
      log_debug(
        `Updated thread ${data.thread_id} for ${provider_name} session ${session_id} (${data.new_entries_added} new entries, files ${data.files_modified ? 'modified' : 'unchanged'})`
      )
      break
    case 'skipped':
      log_debug(
        `Skipped ${provider_name} session ${session_id} (${data.reason})`
      )
      break
    default:
      log(
        `? Unknown status ${status} for ${provider_name} session ${session_id}`
      )
  }
}
