/**
 * Create Threads from Session Provider
 *
 * Unified function for creating threads from any session provider.
 * This eliminates the need for provider-specific batch processing functions
 * and provides a clean, consistent interface across all providers.
 */

import debug from 'debug'
import fs from 'fs/promises'
import path from 'path'

import { get_user_base_directory } from '#libs-server/base-uri/base-directory-registry.mjs'
import config from '#config'
import {
  create_thread_from_session,
  check_thread_exists,
  update_existing_thread
} from '#libs-server/integrations/thread/create-from-session.mjs'
import { build_timeline_from_session } from '#libs-server/integrations/thread/build-timeline-entries.mjs'
import { queue_relation_analysis } from '#libs-server/metadata/analyze-thread-relations.mjs'
import { ClaudeSessionProvider } from '#libs-server/integrations/claude/claude-session-provider.mjs'
import { CursorSessionProvider } from '#libs-server/integrations/cursor/cursor-session-provider.mjs'
import { ChatGPTSessionProvider } from '#libs-server/integrations/chatgpt/chatgpt-session-provider.mjs'
import { PiSessionProvider } from '#libs-server/integrations/pi/pi-session-provider.mjs'
import {
  is_agent_session,
  is_warm_session
} from '#libs-server/integrations/claude/claude-session-helpers.mjs'
import { merge_and_sequence_agent_sessions } from '#libs-server/integrations/claude/merge-agent-sessions.mjs'

const log = debug('integrations:thread:create-from-session-provider')
const log_debug = debug(
  'integrations:thread:create-from-session-provider:debug'
)

/**
 * Look up the most recent metadata.json for a thread from git HEAD, used as a
 * fallback when the on-disk file is briefly missing (e.g. mid-write, stash
 * race in sync-all.sh). Returns null on any failure.
 */
const read_previous_metadata_from_git = async (thread_dir) => {
  try {
    const { spawn } = await import('child_process')
    const thread_submodule_dir = path.dirname(thread_dir)
    const relative = path.basename(thread_dir) + '/metadata.json'
    return await new Promise((resolve) => {
      const proc = spawn('git', ['show', `HEAD:${relative}`], {
        cwd: thread_submodule_dir,
        stdio: ['ignore', 'pipe', 'ignore']
      })
      let out = ''
      proc.stdout.on('data', (chunk) => {
        out += chunk
      })
      proc.on('close', (code) => {
        if (code !== 0) return resolve(null)
        try {
          resolve(JSON.parse(out))
        } catch {
          resolve(null)
        }
      })
      proc.on('error', () => resolve(null))
    })
  } catch {
    return null
  }
}

/**
 * Find a pre-created thread (thread-first flow) that likely corresponds to
 * this session but whose SessionStart hook has not yet synced
 * source.session_id.
 *
 * Scans thread directories for recently-created threads (within 5 minutes)
 * that have a prompt_snippet and session_status but no source.session_id,
 * then compares the session's initial prompt against each candidate's
 * prompt_snippet.
 *
 * @private
 * @param {Object} params
 * @param {Object} params.raw_session - Raw session from provider
 * @param {Object} params.session_provider - Session provider instance
 * @param {string} params.user_base_directory - User base directory path
 * @param {string} params.session_id - Session ID (for logging)
 * @returns {Promise<string|null>} Matching thread_id or null
 */
const find_precreated_thread_by_prompt = async ({
  raw_session,
  session_provider,
  user_base_directory,
  session_id
}) => {
  const { get_thread_base_directory } =
    await import('#libs-server/threads/threads-constants.mjs')
  const threads_dir = get_thread_base_directory({ user_base_directory })

  const RACE_WINDOW_MS = 5 * 60 * 1000
  const now = Date.now()

  let all_items
  try {
    all_items = await fs.readdir(threads_dir)
  } catch {
    return null
  }

  const uuid_re =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  // Pass 1: find candidate pre-created threads within the race window.
  // Use metadata.json stat as a cheap pre-filter before reading content.
  const candidates = []
  for (const item of all_items) {
    if (!uuid_re.test(item)) continue
    try {
      const meta_path = path.join(threads_dir, item, 'metadata.json')
      const stat = await fs.stat(meta_path)
      if (now - stat.mtimeMs > RACE_WINDOW_MS) continue

      const content = await fs.readFile(meta_path, 'utf8')
      const metadata = JSON.parse(content)

      // Must be a pre-created thread: has session_status but no
      // source.session_id (the field that gets set when SessionStart syncs)
      if (!metadata.session_status || metadata.source?.session_id) continue
      if (!metadata.prompt_snippet) continue

      const created_at = new Date(metadata.created_at).getTime()
      if (now - created_at > RACE_WINDOW_MS) continue

      candidates.push({
        thread_id: item,
        prompt_snippet: metadata.prompt_snippet
      })
    } catch {
      continue
    }
  }

  if (candidates.length === 0) return null

  // Pass 2: normalize session to extract initial prompt for comparison.
  // This is deferred until we know candidates exist to avoid unnecessary work.
  const { extract_initial_user_prompt_from_messages } =
    await import('#libs-server/integrations/thread/session-count-utilities.mjs')
  const normalized = session_provider.normalize_session(raw_session)
  const initial_prompt = extract_initial_user_prompt_from_messages({
    messages: normalized.messages
  })

  if (!initial_prompt) return null

  const session_snippet = initial_prompt.slice(0, 200)

  for (const { thread_id, prompt_snippet } of candidates) {
    if (prompt_snippet === session_snippet) {
      log(
        `Pre-created thread ${thread_id} matches session ${session_id} by prompt_snippet`
      )
      return thread_id
    }
  }

  return null
}

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
  chatgpt: ChatGPTSessionProvider,
  pi: PiSessionProvider
}

/**
 * Create threads from a session provider
 *
 * Uses streaming by default to process sessions one at a time, avoiding memory
 * issues with large session sets. For Claude provider, agent sessions are
 * attached to parent sessions during streaming and merged here before processing.
 *
 * @param {Object} params - Parameters object
 * @param {string} params.provider_name - Name of the session provider
 * @param {string} params.user_public_key - User public key for thread creation
 * @param {string} params.user_base_directory - Base directory for user data
 * @param {boolean} params.allow_updates - Allow updating existing threads
 * @param {boolean} params.verbose - Enable verbose logging
 * @param {boolean} params.merge_agents - Merge agent sessions into parent (default: true for Claude)
 * @param {boolean} params.include_warm_agents - Include warm/initialization agents (default: false)
 * @param {Object} params.provider_options - Provider-specific options passed to stream_sessions
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
  provider_options = {},
  source_overrides = null,
  known_thread_id = null
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

  log(`Creating threads using ${session_provider.name} provider (streaming)`)

  // Process each session individually using streaming
  const results = create_empty_results_object()
  let invalid_sessions_count = 0
  let sessions_processed = 0

  // Stream sessions using provider-specific streaming logic
  // For Claude, this builds an agent index first then streams with merging
  const stream_options = {
    ...provider_options,
    include_warm_agents
  }

  for await (const raw_session of session_provider.stream_sessions(
    stream_options
  )) {
    // Validate session
    const validation = session_provider.validate_session(raw_session)
    if (!validation.valid) {
      invalid_sessions_count++
      if (verbose) {
        log_debug(
          `Invalid session ${raw_session.session_id}: ${validation.errors.join(', ')}`
        )
      }
      continue
    }

    // Skip warm/warmup sessions (e.g., cache-priming "Warmup" sessions)
    if (!include_warm_agents && is_warm_session({ session: raw_session })) {
      results.skipped.push({
        session_id: session_provider.get_session_id(raw_session),
        reason: 'warm_session'
      })
      if (verbose) {
        log_debug(
          `Skipping warm session: ${session_provider.get_session_id(raw_session)}`
        )
      }
      sessions_processed++
      continue
    }

    // Skip agent sessions when merge_agents is false
    // (when streaming with Claude provider, agents are already merged or excluded)
    if (!merge_agents && is_agent_session({ session: raw_session })) {
      results.skipped.push({
        session_id: raw_session.session_id,
        reason: 'agent_session_not_merged'
      })
      continue
    }

    // For Claude with streaming, agent_sessions may be attached to the session
    // Merge them if present
    let session_to_process = raw_session
    if (
      provider_name === 'claude' &&
      merge_agents &&
      raw_session.agent_sessions?.length > 0
    ) {
      session_to_process = merge_and_sequence_agent_sessions({
        parent_session: raw_session,
        agent_sessions: raw_session.agent_sessions
      })

      if (verbose) {
        log_debug(
          `Merged ${raw_session.agent_sessions.length} agents into session ${raw_session.session_id}`
        )
      }

      // Release agent session data after merge to help GC
      raw_session.agent_sessions = null
    }

    try {
      const session_result = await process_single_session({
        raw_session: session_to_process,
        session_provider,
        user_public_key,
        user_base_directory,
        allow_updates,
        verbose,
        source_overrides,
        known_thread_id
      })

      // Add result to appropriate category
      results[session_result.status].push(session_result.data)
      sessions_processed++

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
      sessions_processed++
    }

    // Release references to help GC reclaim memory before next iteration
    session_to_process = null
  }

  if (sessions_processed === 0) {
    log(`No sessions found from ${session_provider.name} provider`)
    return create_empty_results_object()
  }

  // Log summary
  const summary = create_results_summary(results, sessions_processed)
  log(
    `${session_provider.name} processing complete: ${summary.created} created, ` +
      `${summary.updated} updated, ${summary.skipped} skipped, ${summary.failed} failed`
  )

  if (invalid_sessions_count > 0) {
    log(`Filtered out ${invalid_sessions_count} invalid sessions`)
  }

  return {
    ...results,
    summary,
    invalid_sessions_count
  }
}

/**
 * Process a single session through the complete workflow
 * @private
 */
export const process_single_session = async ({
  raw_session,
  session_provider,
  user_public_key,
  user_base_directory,
  allow_updates,
  verbose,
  source_overrides = null,
  known_thread_id = null
}) => {
  const session_id = session_provider.get_session_id(raw_session)

  // When known_thread_id is set, skip deterministic check_thread_exists lookup
  // and update the pre-created thread directly
  if (known_thread_id) {
    const { get_thread_base_directory } =
      await import('#libs-server/threads/threads-constants.mjs')
    const thread_dir = path.join(
      get_thread_base_directory({ user_base_directory }),
      known_thread_id
    )
    log(
      `Using known_thread_id ${known_thread_id} for session ${session_id}, skipping check_thread_exists`
    )
    return await update_existing_session_thread({
      raw_session,
      session_provider,
      thread_id: known_thread_id,
      thread_dir,
      session_id,
      source_overrides
    })
  }

  // Check if thread already exists via deterministic ID lookup
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
        session_id,
        source_overrides
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

  // Race guard: thread_dir physically exists but metadata.json is (briefly)
  // missing -- e.g. a concurrent writer is rewriting metadata.json or a
  // safety stash in sync-all.sh captured it mid-window. Creating a fresh
  // thread here would clobber existing attribution. Skip and let the next
  // import cycle handle it once the file is back.
  try {
    const stats = await fs.stat(thread_dir)
    if (stats.isDirectory()) {
      const previous_metadata =
        await read_previous_metadata_from_git(thread_dir)
      if (previous_metadata?.source?.execution_mode === 'container_user') {
        log(
          `Thread dir ${thread_dir} exists without metadata.json but prior git state shows container_user attribution; refusing to recreate`
        )
        return {
          status: 'skipped',
          data: {
            session_id,
            thread_id,
            reason: 'thread_dir_exists_metadata_missing'
          }
        }
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error
    }
  }

  // Secondary dedup: check if a pre-created thread (thread-first flow) already
  // claims this session_id via source.session_id. The deterministic ID lookup
  // above only finds threads whose ID was derived from the session_id hash; it
  // misses pre-created threads that were later linked to this session by the
  // SessionStart hook.
  try {
    const { find_thread_for_session } =
      await import('#libs-server/active-sessions/session-thread-matcher.mjs')
    const existing_thread_id = await find_thread_for_session({ session_id })
    if (existing_thread_id) {
      const { get_thread_base_directory } =
        await import('#libs-server/threads/threads-constants.mjs')
      const existing_thread_dir = path.join(
        get_thread_base_directory({ user_base_directory }),
        existing_thread_id
      )
      log(
        `Found pre-created thread ${existing_thread_id} for session ${session_id} via session matcher`
      )
      return await update_existing_session_thread({
        raw_session,
        session_provider,
        thread_id: existing_thread_id,
        thread_dir: existing_thread_dir,
        session_id,
        source_overrides
      })
    }
  } catch (matcher_error) {
    log(
      `Session matcher lookup failed for ${session_id}: ${matcher_error.message}`
    )
  }

  // Tertiary dedup: check for pre-created threads (thread-first flow) whose
  // SessionStart hook has not yet synced source.session_id. The deterministic
  // ID check (checkpoint 2) misses these because the thread has a random v4
  // UUID, and the session matcher (checkpoint 3) misses because
  // source.session_id is not yet populated. Match by comparing the session's
  // initial prompt against prompt_snippet on recently-created threads.
  try {
    const precreated_thread_id = await find_precreated_thread_by_prompt({
      raw_session,
      session_provider,
      user_base_directory,
      session_id
    })
    if (precreated_thread_id) {
      log(
        `Found pre-created thread ${precreated_thread_id} for session ${session_id} via prompt_snippet match (session hook not yet synced)`
      )
      return {
        status: 'skipped',
        data: {
          session_id,
          thread_id: precreated_thread_id,
          reason: 'precreated_thread_pending_session_sync'
        }
      }
    }
  } catch (precreated_error) {
    log(
      `Pre-created thread prompt lookup failed for ${session_id}: ${precreated_error.message}`
    )
  }

  // Create new thread
  return await create_new_session_thread({
    raw_session,
    session_provider,
    user_public_key,
    user_base_directory,
    session_id,
    source_overrides
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
  session_id,
  source_overrides = null
}) => {
  // Normalize session just-in-time
  let normalized_session = session_provider.normalize_session(raw_session)

  // Extract models before releasing raw session reference
  const models = await session_provider.get_models_from_session(raw_session)

  // Create thread - writes raw data to disk
  // (save_claude_raw_data progressively nulls entries during write)
  const thread_result = await create_thread_from_session({
    normalized_session,
    user_public_key,
    user_base_directory,
    inference_provider: session_provider.get_inference_provider(),
    models,
    raw_session_data: raw_session,
    source_overrides
  })

  // Raw entries were nulled during write, release session wrapper
  raw_session = null

  // Build timeline entries (uses normalized_session only)
  const timeline_result = await build_timeline_from_session(
    normalized_session,
    thread_result
  )

  // Release large objects to help GC
  normalized_session = null

  // Queue relation analysis so new-thread imports get linked to referenced
  // entities without blocking the import on the analysis queue.
  try {
    await queue_relation_analysis(thread_result.thread_id)
  } catch (error) {
    log(
      `Failed to queue relation analysis for thread ${thread_result.thread_id}: ${error.message}`
    )
  }

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
  session_id,
  source_overrides = null
}) => {
  // Normalize session just-in-time
  let normalized_session = session_provider.normalize_session(raw_session)

  // Update existing thread
  const update_result = await update_existing_thread(normalized_session, {
    thread_id,
    thread_dir,
    raw_session_data: raw_session,
    source_overrides
  })

  // Release large objects to help GC
  normalized_session = null

  // Queue relation analysis so re-imports of an existing thread pick up any
  // newly-added entity references without blocking on the analysis queue.
  try {
    await queue_relation_analysis(thread_id)
  } catch (error) {
    log(
      `Failed to queue relation analysis for thread ${thread_id}: ${error.message}`
    )
  }

  return {
    status: 'updated',
    data: {
      session_id,
      thread_id,
      thread_dir,
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
        `Updated thread ${data.thread_id} for ${provider_name} session ${session_id} (files ${data.files_modified ? 'modified' : 'unchanged'})`
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
