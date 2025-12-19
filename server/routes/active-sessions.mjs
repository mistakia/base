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

const router = express.Router({ mergeParams: true })

/**
 * GET /api/active-sessions
 * List all active sessions
 */
router.get('/', async (req, res) => {
  const { log } = req.app.locals

  try {
    const sessions = await get_all_active_sessions()
    log(`Retrieved ${sessions.length} active sessions`)
    res.status(200).json(sessions)
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
 * Get a specific active session
 */
router.get('/:session_id', async (req, res) => {
  const { log } = req.app.locals
  const { session_id } = req.params

  try {
    const session = await get_active_session(session_id)

    if (!session) {
      return res.status(404).json({
        error: 'Session not found',
        message: `No active session with ID ${session_id}`
      })
    }

    res.status(200).json(session)
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
      // Update session with thread association
      session.thread_id = thread_id
      await update_active_session({
        session_id,
        thread_id
      })
    }

    // Emit WebSocket event
    emit_active_session_started(session)

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
        session.thread_id = found_thread_id
        await update_active_session({
          session_id,
          thread_id: found_thread_id
        })
      }
    }

    // Emit WebSocket event
    emit_active_session_updated(session)

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
    emit_active_session_ended(session_id)

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