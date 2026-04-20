import express from 'express'
import debug from 'debug'

import {
  register_active_session,
  update_active_session,
  get_active_session,
  get_all_active_sessions,
  get_and_remove_active_session
} from '#server/services/active-sessions/active-session-store.mjs'
import { find_thread_for_session } from '#libs-server/active-sessions/session-thread-matcher.mjs'
import {
  emit_active_session_started,
  emit_active_session_updated,
  emit_active_session_ended
} from '#server/services/active-sessions/session-event-emitter.mjs'
import path from 'path'
import { read_json_file } from '#libs-server/threads/thread-utils.mjs'
import { get_thread_base_directory } from '#libs-server/threads/threads-constants.mjs'
import { get_cached_latest_timeline_entry } from '#server/services/thread-watcher.mjs'
import { invalidate_thread_cache } from '#server/routes/threads.mjs'
import { check_thread_permission } from '#server/middleware/permission/index.mjs'
import { redact_session_data } from '#server/middleware/content-redactor.mjs'
import require_hook_auth from '#server/middleware/hook-auth.mjs'

const log = debug('api:active-sessions')
const log_lifecycle = debug('base:session-lifecycle')

/**
 * Apply permission-based redaction to a session
 *
 * @param {Object} session - Session to potentially redact
 * @param {string|null} user_public_key - Requesting user's public key
 * @param {Object} [options] - Options
 * @param {Object} [options.thread_metadata] - Pre-loaded thread metadata to avoid duplicate disk reads
 * @returns {Promise<Object>} Session (possibly redacted) with can_write property
 */
async function apply_session_redaction(
  session,
  user_public_key,
  { thread_metadata = null } = {}
) {
  if (!session) return session

  // Sessions with thread_id - check thread permission
  if (session.thread_id) {
    try {
      const permission_result = await check_thread_permission({
        user_public_key,
        thread_id: session.thread_id,
        metadata: thread_metadata
      })

      if (!permission_result.read?.allowed) {
        return { ...redact_session_data(session), can_write: false }
      }

      const can_write = permission_result.write?.allowed ?? false
      return { ...session, can_write }
    } catch (error) {
      // On permission check failure, redact to be safe
      log(
        `Error checking permission for session thread ${session.thread_id}: ${error.message}`
      )
      return { ...redact_session_data(session), can_write: false }
    }
  }

  // Sessions with job_id are from authenticated thread creation -
  // don't redact since the creating user initiated them
  if (session.job_id) {
    return { ...session, can_write: false }
  }

  // Sessions without thread or job_id - redact paths and no write permission
  return { ...redact_session_data(session), can_write: false }
}

/**
 * Get thread info for a session including metadata and latest timeline event.
 * Reads metadata.json (small file) for most fields and uses the thread watcher's
 * in-memory cache for the latest timeline entry, avoiding expensive full-file streams.
 *
 * @param {string} thread_id - Thread ID to fetch info for
 * @returns {Promise<Object>} Object with thread metadata fields
 */
async function get_thread_info_for_session(thread_id) {
  const empty_result = {
    thread_title: null,
    thread_state: null,
    latest_timeline_event: null,
    message_count: null,
    duration_minutes: null,
    total_tokens: null,
    source_provider: null,
    _metadata: null
  }

  if (!thread_id) return empty_result

  try {
    const thread_base_dir = get_thread_base_directory()
    const thread_dir = path.join(thread_base_dir, thread_id)
    const metadata_path = path.join(thread_dir, 'metadata.json')

    const metadata = await read_json_file({ file_path: metadata_path })

    // Use thread watcher cache instead of streaming entire timeline
    const cached_entry = get_cached_latest_timeline_entry(thread_id)

    return {
      thread_title: metadata.title || null,
      thread_state: metadata.thread_state || null,
      thread_created_at: metadata.created_at || null,
      latest_timeline_event: cached_entry || null,
      message_count: metadata.message_count || null,
      duration_minutes: metadata.duration_minutes || null,
      total_tokens: metadata.total_tokens || null,
      source_provider: metadata.source?.provider || null,
      _metadata: metadata
    }
  } catch {
    // Thread may not exist yet or be inaccessible
    return empty_result
  }
}

/**
 * Enrich a session with fresh thread info from disk
 *
 * Reads the latest thread metadata and timeline event from the thread's files,
 * ensuring we return current data rather than potentially stale Redis cache.
 *
 * @param {Object} session - Session to enrich
 * @returns {Promise<Object>} Session with fresh thread data
 */
async function enrich_session_with_thread_info(session) {
  if (!session || !session.thread_id) {
    return session
  }

  const thread_info = await get_thread_info_for_session(session.thread_id)

  return {
    ...session,
    // Use fresh data, falling back to cached if read fails
    thread_title: thread_info.thread_title || session.thread_title,
    thread_state: thread_info.thread_state,
    thread_created_at:
      thread_info.thread_created_at || session.thread_created_at,
    latest_timeline_event:
      thread_info.latest_timeline_event || session.latest_timeline_event,
    message_count: thread_info.message_count,
    duration_minutes: thread_info.duration_minutes,
    total_tokens: thread_info.total_tokens,
    source_provider: thread_info.source_provider,
    // Carry pre-loaded metadata for permission checks (avoids duplicate disk read)
    _thread_metadata: thread_info._metadata
  }
}

const router = express.Router({ mergeParams: true })

/**
 * GET /api/active-sessions
 * List all active sessions with permission-based redaction
 */
router.get('/', async (req, res) => {
  const { log } = req.app.locals
  const user_public_key = req.user?.user_public_key || null

  try {
    const sessions = await get_all_active_sessions()

    // Enrich sessions with fresh thread info (title and latest timeline event)
    // This ensures we always return the current latest event, not stale Redis data
    const enriched_sessions = await Promise.all(
      sessions.map(enrich_session_with_thread_info)
    )

    // Filter out sessions without a locally-available thread (unless they have
    // a job_id indicating in-progress thread creation) and archived threads.
    // Sessions from other machines whose thread data hasn't synced yet are
    // excluded rather than shown as redacted.
    //
    // For authenticated requests, also filter out sessions whose thread is
    // owned by a different user. Unauthenticated (public) callers retain the
    // prior behavior and rely on permission-based redaction below.
    const active_thread_sessions = enriched_sessions.filter((session) => {
      if (session.thread_state === 'archived') return false
      if (!session.thread_id && !session.job_id) return false

      if (user_public_key && session.thread_id) {
        const owner = session._thread_metadata?.user_public_key || null
        if (owner && owner !== user_public_key) return false
      }

      return true
    })

    // Apply permission-based redaction to each session, passing pre-loaded
    // metadata to avoid duplicate disk reads in check_thread_permission
    const redacted_sessions = await Promise.all(
      active_thread_sessions.map(async (session) => {
        const { _thread_metadata, ...session_without_metadata } = session
        return apply_session_redaction(
          session_without_metadata,
          user_public_key,
          { thread_metadata: _thread_metadata }
        )
      })
    )

    log(
      `Retrieved ${redacted_sessions.length} active sessions (filtered ${enriched_sessions.length - active_thread_sessions.length} without local thread or archived)`
    )
    res.status(200).json(redacted_sessions)
  } catch (error) {
    log('Error listing active sessions:', error)
    res.status(500).json({
      error: 'Failed to list active sessions',
      message: error.message
    })
  }
})

/**
 * GET /api/active-sessions/:session_id
 * Get a specific active session with permission-based redaction
 */
router.get('/:session_id', async (req, res) => {
  const { log } = req.app.locals
  const { session_id } = req.params
  const user_public_key = req.user?.user_public_key || null

  try {
    const session = await get_active_session(session_id)

    if (!session) {
      return res.status(404).json({
        error: 'Session not found',
        message: `No active session with ID ${session_id}`
      })
    }

    // Enrich session with fresh thread info (title and latest timeline event)
    const enriched_session = await enrich_session_with_thread_info(session)

    // Apply permission-based redaction, passing pre-loaded metadata
    const { _thread_metadata, ...session_without_metadata } = enriched_session
    const redacted_session = await apply_session_redaction(
      session_without_metadata,
      user_public_key,
      { thread_metadata: _thread_metadata }
    )

    res.status(200).json(redacted_session)
  } catch (error) {
    log(`Error getting active session ${session_id}:`, error)
    res.status(500).json({
      error: 'Failed to get active session',
      message: error.message
    })
  }
})

/**
 * POST /api/active-sessions
 * Register a new active session (called by SessionStart hook)
 */
router.post('/', require_hook_auth, async (req, res) => {
  const { log } = req.app.locals
  const {
    session_id,
    working_directory,
    transcript_path,
    job_id,
    hook_source
  } = req.body

  if (!session_id) {
    return res.status(400).json({
      error: 'Missing required field',
      message: 'session_id is required'
    })
  }

  try {
    log_lifecycle(
      'POST session_started session_id=%s job_id=%s hook_source=%s working_directory=%s',
      session_id,
      job_id || 'none',
      hook_source || 'none',
      working_directory
    )

    // Treat Claude Code SessionStart source=resume as an intentional resume
    // so the tombstone guard is cleared rather than blocking registration.
    const resume = hook_source === 'resume'

    // Register the session
    const session = await register_active_session({
      session_id,
      working_directory,
      transcript_path,
      job_id,
      resume
    })

    // Tombstone guard: session was recently deleted, refuse to re-create.
    // Mirrors the PUT handler's tombstoned response.
    if (!session) {
      log_lifecycle(
        'POST session_tombstoned session_id=%s (late arrival after DELETE)',
        session_id
      )
      return res
        .status(200)
        .json({ success: true, session_id, tombstoned: true })
    }

    // Try to find an associated thread
    const thread_id = await find_thread_for_session({
      session_id,
      transcript_path
    })

    if (thread_id) {
      // Get thread info (title, timeline event, and metadata)
      const thread_info = await get_thread_info_for_session(thread_id)

      // Update session with thread association and info
      session.thread_id = thread_id
      session.thread_title = thread_info.thread_title
      session.thread_created_at = thread_info.thread_created_at
      session.latest_timeline_event = thread_info.latest_timeline_event
      session.message_count = thread_info.message_count
      session.duration_minutes = thread_info.duration_minutes
      session.total_tokens = thread_info.total_tokens
      session.source_provider = thread_info.source_provider

      await update_active_session({
        session_id,
        thread_id,
        thread_title: thread_info.thread_title,
        thread_created_at: thread_info.thread_created_at,
        latest_timeline_event: thread_info.latest_timeline_event,
        message_count: thread_info.message_count,
        duration_minutes: thread_info.duration_minutes,
        total_tokens: thread_info.total_tokens,
        source_provider: thread_info.source_provider
      })
    }

    // Emit WebSocket event
    await emit_active_session_started(session)

    log_lifecycle(
      'POST session_registered session_id=%s job_id=%s thread_id=%s',
      session_id,
      session.job_id || 'none',
      session.thread_id || 'none'
    )
    log(
      `Registered active session: ${session_id} (job_id=${session.job_id || 'none'}, thread_id=${session.thread_id || 'none'})`
    )
    res.status(201).json(session)
  } catch (error) {
    log(`Error registering active session ${session_id}:`, error)
    res.status(500).json({
      error: 'Failed to register active session',
      message: error.message
    })
  }
})

/**
 * PUT /api/active-sessions/:session_id
 * Update an active session (with upsert behavior)
 * Called by UserPromptSubmit, PostToolUse (status=active) and Stop (status=idle) hooks
 */
router.put('/:session_id', require_hook_auth, async (req, res) => {
  const { log } = req.app.locals
  const { session_id } = req.params
  const {
    status,
    thread_id,
    working_directory,
    transcript_path,
    job_id,
    context_percentage,
    context_window_size
  } = req.body

  try {
    // Read stored session state before updating to track thread discovery
    const existing_session = await get_active_session(session_id)
    const had_thread_before = !!existing_session?.thread_id

    // Update (or upsert) the session
    const session = await update_active_session({
      session_id,
      status,
      thread_id,
      working_directory,
      transcript_path,
      job_id,
      context_percentage,
      context_window_size
    })

    // Tombstone guard: session was recently deleted, late PUT must not re-create
    if (!session) {
      log_lifecycle(
        'PUT session_tombstoned session_id=%s status=%s (late arrival after DELETE)',
        session_id,
        status
      )
      return res
        .status(200)
        .json({ success: true, session_id, tombstoned: true })
    }

    // If no thread_id yet and none provided in request body, try to discover one
    if (!session.thread_id && !thread_id) {
      const found_thread_id = await find_thread_for_session({
        session_id,
        transcript_path: session.transcript_path
      })

      if (found_thread_id) {
        // Get thread info (title, timeline event, and metadata)
        const thread_info = await get_thread_info_for_session(found_thread_id)

        if (!thread_info.latest_timeline_event) {
          log_lifecycle(
            'PUT thread_discovery_no_timeline session_id=%s thread_id=%s (watcher cache empty, possible race)',
            session_id,
            found_thread_id
          )
        }

        session.thread_id = found_thread_id
        session.thread_title = thread_info.thread_title
        session.thread_created_at = thread_info.thread_created_at
        session.latest_timeline_event = thread_info.latest_timeline_event
        session.message_count = thread_info.message_count
        session.duration_minutes = thread_info.duration_minutes
        session.total_tokens = thread_info.total_tokens
        session.source_provider = thread_info.source_provider

        await update_active_session({
          session_id,
          thread_id: found_thread_id,
          thread_title: thread_info.thread_title,
          thread_created_at: thread_info.thread_created_at,
          latest_timeline_event: thread_info.latest_timeline_event,
          message_count: thread_info.message_count,
          duration_minutes: thread_info.duration_minutes,
          total_tokens: thread_info.total_tokens,
          source_provider: thread_info.source_provider
        })
      }
    } else {
      // Thread already associated -- only update latest_timeline_event from cache
      // Skip metadata disk reads on every hook fire; metadata is refreshed by GET endpoints
      const cached_entry = get_cached_latest_timeline_entry(session.thread_id)

      if (cached_entry) {
        session.latest_timeline_event = cached_entry

        await update_active_session({
          session_id,
          latest_timeline_event: cached_entry
        })

        invalidate_thread_cache(session.thread_id)
      }
    }

    // Emit WebSocket event
    await emit_active_session_updated(session)

    const thread_discovery =
      !had_thread_before && session.thread_id
        ? 'new'
        : session.thread_id
          ? 'existing'
          : 'none'
    log_lifecycle(
      'PUT session_updated session_id=%s status=%s thread_id=%s thread_discovery=%s latest_timeline_updated=%s',
      session_id,
      session.status,
      session.thread_id || 'none',
      thread_discovery,
      !!session.latest_timeline_event
    )
    log(`Updated active session: ${session_id} status=${session.status}`)
    res.status(200).json(session)
  } catch (error) {
    log(`Error updating active session ${session_id}:`, error)
    res.status(500).json({
      error: 'Failed to update active session',
      message: error.message
    })
  }
})

/**
 * DELETE /api/active-sessions/:session_id
 * Remove an active session (called by SessionEnd hook)
 */
router.delete('/:session_id', require_hook_auth, async (req, res) => {
  const { log } = req.app.locals
  const { session_id } = req.params

  try {
    // Read session data before removal so the ENDED event can include it
    // for permission-based filtering (consistent with STARTED/UPDATED events)
    const session = await get_and_remove_active_session(session_id)

    if (!session) {
      log(
        `Session ${session_id} was not in store (already removed or never registered)`
      )
    }

    // Emit WebSocket event with session data for permission checks
    await emit_active_session_ended(session_id, session)

    log_lifecycle(
      'DELETE session_ended session_id=%s thread_id=%s',
      session_id,
      session?.thread_id || 'none'
    )
    log(`Removed active session: ${session_id}`)
    res.status(200).json({ success: true, session_id })
  } catch (error) {
    log(`Error removing active session ${session_id}:`, error)
    res.status(500).json({
      error: 'Failed to remove active session',
      message: error.message
    })
  }
})

export default router
