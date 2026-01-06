import express from 'express'

import {
  register_active_session,
  update_active_session,
  get_active_session,
  get_all_active_sessions,
  remove_active_session,
  find_thread_for_session,
  emit_active_session_started,
  emit_active_session_updated,
  emit_active_session_ended
} from '#libs-server/active-sessions/index.mjs'
import {
  read_thread_data,
  get_latest_timeline_event
} from '#libs-server/threads/thread-utils.mjs'
import { check_thread_permission_for_user } from '#server/middleware/permission/index.mjs'
import { redact_session_data } from '#server/middleware/content-redactor.mjs'

/**
 * Apply permission-based redaction to a session
 *
 * @param {Object} session - Session to potentially redact
 * @param {string|null} user_public_key - Requesting user's public key
 * @returns {Promise<Object>} Session (possibly redacted)
 */
async function apply_session_redaction(session, user_public_key) {
  if (!session) return session

  // Sessions with thread_id - check thread permission
  if (session.thread_id) {
    try {
      const permission_result = await check_thread_permission_for_user({
        user_public_key,
        thread_id: session.thread_id
      })

      if (!permission_result.allowed) {
        return redact_session_data(session)
      }

      return session
    } catch {
      // On permission check failure, redact to be safe
      return redact_session_data(session)
    }
  }

  // Sessions without thread - redact paths (can't verify ownership)
  return redact_session_data(session)
}

/**
 * Get thread info for a session including metadata and latest timeline event
 * @param {string} thread_id - Thread ID to fetch info for
 * @returns {Promise<Object>} Object with thread metadata fields
 */
async function get_thread_info_for_session(thread_id) {
  const empty_result = {
    thread_title: null,
    latest_timeline_event: null,
    message_count: null,
    duration_minutes: null,
    total_tokens: null,
    session_provider: null
  }

  if (!thread_id) return empty_result

  try {
    const { metadata } = await read_thread_data({ thread_id })

    // Get latest non-system timeline event
    const latest_timeline_event = await get_latest_timeline_event({
      thread_id,
      exclude_system: true
    })

    return {
      thread_title: metadata.title || null,
      latest_timeline_event,
      message_count: metadata.message_count || null,
      duration_minutes: metadata.duration_minutes || null,
      total_tokens: metadata.total_tokens || null,
      session_provider: metadata.session_provider || null
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
    latest_timeline_event:
      thread_info.latest_timeline_event || session.latest_timeline_event,
    message_count: thread_info.message_count,
    duration_minutes: thread_info.duration_minutes,
    total_tokens: thread_info.total_tokens,
    session_provider: thread_info.session_provider
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

    // Apply permission-based redaction to each session
    const redacted_sessions = await Promise.all(
      enriched_sessions.map((session) =>
        apply_session_redaction(session, user_public_key)
      )
    )

    log(`Retrieved ${redacted_sessions.length} active sessions`)
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

    // Apply permission-based redaction
    const redacted_session = await apply_session_redaction(
      enriched_session,
      user_public_key
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
router.post('/', async (req, res) => {
  const { log } = req.app.locals
  const { session_id, working_directory, transcript_path } = req.body

  if (!session_id) {
    return res.status(400).json({
      error: 'Missing required field',
      message: 'session_id is required'
    })
  }

  try {
    // Register the session
    const session = await register_active_session({
      session_id,
      working_directory,
      transcript_path
    })

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
      session.latest_timeline_event = thread_info.latest_timeline_event
      session.message_count = thread_info.message_count
      session.duration_minutes = thread_info.duration_minutes
      session.total_tokens = thread_info.total_tokens
      session.session_provider = thread_info.session_provider

      await update_active_session({
        session_id,
        thread_id,
        thread_title: thread_info.thread_title,
        latest_timeline_event: thread_info.latest_timeline_event,
        message_count: thread_info.message_count,
        duration_minutes: thread_info.duration_minutes,
        total_tokens: thread_info.total_tokens,
        session_provider: thread_info.session_provider
      })
    }

    // Emit WebSocket event
    await emit_active_session_started(session)

    log(`Registered active session: ${session_id}`)
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
router.put('/:session_id', async (req, res) => {
  const { log } = req.app.locals
  const { session_id } = req.params
  const { status, thread_id, working_directory, transcript_path } = req.body

  try {
    // Update (or upsert) the session
    const session = await update_active_session({
      session_id,
      status,
      thread_id,
      working_directory,
      transcript_path
    })

    // If no thread_id yet, try to find one
    if (!session.thread_id) {
      const found_thread_id = await find_thread_for_session({
        session_id,
        transcript_path: session.transcript_path
      })

      if (found_thread_id) {
        // Get thread info (title, timeline event, and metadata)
        const thread_info = await get_thread_info_for_session(found_thread_id)

        session.thread_id = found_thread_id
        session.thread_title = thread_info.thread_title
        session.latest_timeline_event = thread_info.latest_timeline_event
        session.message_count = thread_info.message_count
        session.duration_minutes = thread_info.duration_minutes
        session.total_tokens = thread_info.total_tokens
        session.session_provider = thread_info.session_provider

        await update_active_session({
          session_id,
          thread_id: found_thread_id,
          thread_title: thread_info.thread_title,
          latest_timeline_event: thread_info.latest_timeline_event,
          message_count: thread_info.message_count,
          duration_minutes: thread_info.duration_minutes,
          total_tokens: thread_info.total_tokens,
          session_provider: thread_info.session_provider
        })
      }
    } else {
      // Thread already associated, refresh thread info
      const thread_info = await get_thread_info_for_session(session.thread_id)

      session.thread_title = thread_info.thread_title
      session.latest_timeline_event = thread_info.latest_timeline_event
      session.message_count = thread_info.message_count
      session.duration_minutes = thread_info.duration_minutes
      session.total_tokens = thread_info.total_tokens
      session.session_provider = thread_info.session_provider

      await update_active_session({
        session_id,
        thread_title: thread_info.thread_title,
        latest_timeline_event: thread_info.latest_timeline_event,
        message_count: thread_info.message_count,
        duration_minutes: thread_info.duration_minutes,
        total_tokens: thread_info.total_tokens,
        session_provider: thread_info.session_provider
      })
    }

    // Emit WebSocket event
    await emit_active_session_updated(session)

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
router.delete('/:session_id', async (req, res) => {
  const { log } = req.app.locals
  const { session_id } = req.params

  try {
    const removed = await remove_active_session(session_id)

    if (!removed) {
      // Session was already removed or never existed - still return success
      log(
        `Session ${session_id} was not in store (already removed or never registered)`
      )
    }

    // Emit WebSocket event
    await emit_active_session_ended(session_id)

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
