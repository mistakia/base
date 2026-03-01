import { Record, Map } from 'immutable'

import { active_sessions_action_types } from './actions'
import { threads_action_types } from '@core/threads/actions'
import { log_lifecycle } from '@core/utils/session-lifecycle-debug'

// ============================================================================
// Initial State
// ============================================================================

const ActiveSessionsState = new Record({
  // Map of session_id -> session data
  sessions: new Map(),
  // Map of job_id -> pending session data (tracks sessions before hooks fire)
  pending_sessions: new Map(),
  // Map of session_id -> ended session data (retained for late THREAD_CREATED correlation)
  ended_sessions: new Map(),
  // Map of session_id -> prompt_snippet (persistent, never overwritten by server data)
  // Populated from pending sessions when they transition to active.
  // Also keyed by job_id during the pending phase for early lookup.
  prompt_snippets: new Map(),
  is_loading: false,
  error: null
})

// ============================================================================
// Reducer Function
// ============================================================================

export function active_sessions_reducer(
  state = new ActiveSessionsState(),
  { payload, type }
) {
  switch (type) {
    // ========================================================================
    // API Loading States
    // ========================================================================

    case active_sessions_action_types.GET_ACTIVE_SESSIONS_PENDING:
      return state.merge({
        is_loading: true,
        error: null
      })

    case active_sessions_action_types.GET_ACTIVE_SESSIONS_FULFILLED: {
      // Build Map from API response, preserving client-side fields
      const sessions_array = payload.data || []
      const existing_sessions = state.get('sessions')
      const api_session_ids = new Set(sessions_array.map((s) => s.session_id))

      const now = Date.now()
      const stale_threshold_ms = 5 * 60 * 1000

      let sessions_map = new Map(
        sessions_array.map((session) => {
          const existing = existing_sessions.get(session.session_id)
          if (existing) {
            // Merge server data onto existing, preserving client-side fields
            // like prompt_snippet that the server doesn't know about
            return [session.session_id, existing.merge(session)]
          }
          return [session.session_id, Map(session)]
        })
      )

      // Preserve recent sessions added via WebSocket that the API didn't
      // return. These may have arrived between the API request and response,
      // or the server may not yet have indexed them. Sessions older than 5
      // minutes that the API has never returned are considered stale and
      // dropped to prevent permanent accumulation from missed ENDED events.
      sessions_map = sessions_map.withMutations((mutable) => {
        existing_sessions.forEach((session, session_id) => {
          if (api_session_ids.has(session_id)) return
          const session_time = new Date(
            session.get('created_at') || session.get('started_at') || 0
          ).getTime()
          if (now - session_time < stale_threshold_ms) {
            mutable.set(session_id, session)
          }
        })
      })

      // Remove any ended_sessions that the server still reports as active
      // to prevent duplicates across both maps
      let new_ended = state.get('ended_sessions')
      sessions_array.forEach((session) => {
        if (new_ended.has(session.session_id)) {
          new_ended = new_ended.delete(session.session_id)
        }
      })

      return state.merge({
        sessions: sessions_map,
        ended_sessions: new_ended,
        is_loading: false,
        error: null
      })
    }

    case active_sessions_action_types.GET_ACTIVE_SESSIONS_FAILED:
      return state.merge({
        is_loading: false,
        error: payload.error
      })

    // ========================================================================
    // WebSocket Real-Time Events
    // ========================================================================

    case active_sessions_action_types.ACTIVE_SESSION_STARTED: {
      const { session } = payload
      const matched_pending = !!(
        session.job_id && state.hasIn(['pending_sessions', session.job_id])
      )
      log_lifecycle('ACTIVE_SESSION_STARTED', {
        session_id: session.session_id,
        job_id: session.job_id,
        matched_pending
      })

      // If session has a job_id matching a pending session, merge and remove from pending
      if (session.job_id && state.hasIn(['pending_sessions', session.job_id])) {
        const pending = state.getIn(['pending_sessions', session.job_id])
        const snippet = pending.get('prompt_snippet') || null
        const merged_session = {
          ...session,
          prompt_snippet: snippet
        }
        let new_state = state
          .setIn(['sessions', session.session_id], Map(merged_session))
          .deleteIn(['pending_sessions', session.job_id])
        // Re-key snippet from job_id to session_id (permanent key)
        if (snippet) {
          new_state = new_state
            .deleteIn(['prompt_snippets', session.job_id])
            .setIn(['prompt_snippets', session.session_id], snippet)
        }
        return new_state
      }

      // No pending match -- check if a prompt_snippet was stored by job_id
      // (handles race: WS STARTED arrives before HTTP FULFILLED)
      if (session.job_id) {
        const snippet = state.getIn(['prompt_snippets', session.job_id])
        if (snippet) {
          const merged_session = { ...session, prompt_snippet: snippet }
          return state
            .setIn(['sessions', session.session_id], Map(merged_session))
            .deleteIn(['prompt_snippets', session.job_id])
            .setIn(['prompt_snippets', session.session_id], snippet)
        }
      }

      return state.setIn(['sessions', session.session_id], Map(session))
    }

    case active_sessions_action_types.ACTIVE_SESSION_UPDATED: {
      const { session } = payload
      const existing_thread = state.getIn([
        'sessions',
        session.session_id,
        'thread_id'
      ])
      const thread_link =
        !existing_thread && session.thread_id
          ? 'new'
          : session.thread_id
            ? 'existing'
            : 'none'
      log_lifecycle('ACTIVE_SESSION_UPDATED', {
        session_id: session.session_id,
        thread_id: session.thread_id,
        thread_link,
        status: session.status
      })

      // If session is in ended_sessions, update there instead of creating a duplicate
      if (state.hasIn(['ended_sessions', session.session_id])) {
        return state.updateIn(
          ['ended_sessions', session.session_id],
          (existing) => existing.merge(session)
        )
      }

      // Merge into existing session or upsert if not yet known.
      // Upsert handles missed STARTED events (e.g., browser opened after
      // session began, or WS was disconnected during STARTED broadcast).
      if (state.hasIn(['sessions', session.session_id])) {
        return state.updateIn(['sessions', session.session_id], (existing) =>
          existing.merge(session)
        )
      }

      return state.setIn(['sessions', session.session_id], Map(session))
    }

    case active_sessions_action_types.ACTIVE_SESSION_ENDED: {
      const { session_id } = payload
      const session = state.getIn(['sessions', session_id])
      log_lifecycle('ACTIVE_SESSION_ENDED', {
        session_id,
        thread_id: session?.get('thread_id') || null,
        had_session: !!session
      })
      if (session) {
        const has_thread = !!session.get('thread_id')
        if (has_thread) {
          // Keep session with thread inline as ended (visible as completed card)
          return state.setIn(
            ['sessions', session_id],
            session.merge({
              status: 'ended',
              ended_at: new Date().toISOString()
            })
          )
        }
        // No thread -- move to ended_sessions for auto-dismiss
        return state
          .deleteIn(['sessions', session_id])
          .setIn(['ended_sessions', session_id], session.set('status', 'ended'))
      }
      return state.deleteIn(['sessions', session_id])
    }

    case active_sessions_action_types.DISMISS_ENDED_SESSION: {
      const { session_id } = payload
      // Also remove from sessions map if it has ended status (inline ended sessions)
      const session = state.getIn(['sessions', session_id])
      let new_state = state
        .deleteIn(['ended_sessions', session_id])
        .deleteIn(['prompt_snippets', session_id])
      if (session && session.get('status') === 'ended') {
        new_state = new_state.deleteIn(['sessions', session_id])
      }
      return new_state
    }

    // ========================================================================
    // Thread Creation Correlation
    // ========================================================================

    case threads_action_types.THREAD_CREATED: {
      const thread = payload.thread
      const source_session_id = thread?.source?.session_id
      const matched_in =
        source_session_id && state.hasIn(['sessions', source_session_id])
          ? 'active'
          : source_session_id &&
              state.hasIn(['ended_sessions', source_session_id])
            ? 'ended'
            : 'none'
      log_lifecycle('THREAD_CREATED', {
        thread_id: thread?.thread_id,
        source_session_id,
        matched_in
      })
      if (!source_session_id) return state

      // Check active sessions first, then ended sessions
      if (state.hasIn(['sessions', source_session_id])) {
        return state.updateIn(['sessions', source_session_id], (session) =>
          session.merge({
            thread_id: thread.thread_id,
            thread_title: thread.title || null
          })
        )
      }

      if (state.hasIn(['ended_sessions', source_session_id])) {
        // Session ended before thread was linked. Now that we have a thread_id,
        // promote it back to sessions (consistent with ACTIVE_SESSION_ENDED
        // keeping sessions with thread_id inline in the sessions map).
        const ended_session = state.getIn(['ended_sessions', source_session_id])
        return state.deleteIn(['ended_sessions', source_session_id]).setIn(
          ['sessions', source_session_id],
          ended_session.merge({
            thread_id: thread.thread_id,
            thread_title: thread.title || null
          })
        )
      }

      return state
    }

    // ========================================================================
    // Thread Timeline Events (from threads slice)
    // ========================================================================

    case threads_action_types.THREAD_TIMELINE_ENTRY_ADDED: {
      const { thread_id, entry } = payload

      // Skip system events (should not be shown as latest)
      if (entry.type === 'system') {
        return state
      }

      // Find session with matching thread_id and update its latest_timeline_event
      const sessions = state.get('sessions')
      const session_entry = sessions.findEntry(
        (session) => session.get('thread_id') === thread_id
      )

      log_lifecycle('THREAD_TIMELINE_ENTRY_ADDED', {
        thread_id,
        matched_session: session_entry ? session_entry[0] : null,
        truncated: !!entry.truncated
      })

      if (session_entry) {
        const [session_id] = session_entry
        return state.setIn(
          ['sessions', session_id, 'latest_timeline_event'],
          entry
        )
      }

      return state
    }

    // ========================================================================
    // Pending Session Lifecycle (thread creation -> hook fires)
    // ========================================================================

    case threads_action_types.CREATE_THREAD_SESSION_PENDING: {
      const { opts } = payload
      const pending_id = `pending-${Date.now()}`
      const prompt_snippet = (opts.prompt || '').slice(0, 120)
      const pending_session = Map({
        pending_id,
        status: 'queued',
        prompt_snippet,
        working_directory: opts.working_directory || null,
        created_at: new Date().toISOString()
      })

      // Store with pending_id as temp key; will be re-keyed on FULFILLED when job_id arrives
      let new_state = state.setIn(
        ['pending_sessions', pending_id],
        pending_session
      )
      // Store prompt_snippet by pending_id for early lookup
      if (prompt_snippet) {
        new_state = new_state.setIn(
          ['prompt_snippets', pending_id],
          prompt_snippet
        )
      }
      return new_state
    }

    case threads_action_types.CREATE_THREAD_SESSION_FULFILLED: {
      const { opts, data } = payload
      const job_id = data?.job_id

      if (!job_id) return state

      // Find the most recent pending session without a job_id (matching by prompt)
      const pending_entry = state
        .get('pending_sessions')
        .findEntry(
          (session) =>
            !session.get('job_id') &&
            session.get('prompt_snippet') === (opts.prompt || '').slice(0, 120)
        )

      if (pending_entry) {
        const [old_key, pending_session] = pending_entry
        const snippet = pending_session.get('prompt_snippet')

        // Check if ACTIVE_SESSION_STARTED already arrived via WS (race: WS before HTTP)
        const existing_active = state
          .get('sessions')
          .find((s) => s.get('job_id') === job_id)

        if (existing_active) {
          // Session already in active state -- backfill prompt_snippet and clean up pending
          const session_id = existing_active.get('session_id')
          let new_state = state.deleteIn(['pending_sessions', old_key])
          if (snippet) {
            new_state = new_state
              .setIn(['sessions', session_id, 'prompt_snippet'], snippet)
              .deleteIn(['prompt_snippets', old_key])
              .setIn(['prompt_snippets', session_id], snippet)
          }
          return new_state
        }

        // Normal path: re-key pending from pending_id to job_id
        const updated_session = pending_session.merge({
          job_id,
          queue_position: data.queue_position,
          status: 'queued'
        })
        let new_state = state
          .deleteIn(['pending_sessions', old_key])
          .setIn(['pending_sessions', job_id], updated_session)

        // Re-key prompt_snippet from pending_id to job_id
        if (snippet) {
          new_state = new_state
            .deleteIn(['prompt_snippets', old_key])
            .setIn(['prompt_snippets', job_id], snippet)
        }
        return new_state
      }

      return state
    }

    case threads_action_types.CREATE_THREAD_SESSION_FAILED: {
      const { opts, error } = payload

      // Find matching pending session and mark as failed
      const pending_entry = state
        .get('pending_sessions')
        .findEntry(
          (session) =>
            session.get('prompt_snippet') === (opts.prompt || '').slice(0, 120)
        )

      if (pending_entry) {
        const [key] = pending_entry
        return state.setIn(
          ['pending_sessions', key],
          state.getIn(['pending_sessions', key]).merge({
            status: 'failed',
            error_message: error
          })
        )
      }

      return state
    }

    case threads_action_types.THREAD_JOB_FAILED: {
      const { job_id, error_message } = payload

      if (job_id && state.hasIn(['pending_sessions', job_id])) {
        return state.setIn(
          ['pending_sessions', job_id],
          state.getIn(['pending_sessions', job_id]).merge({
            status: 'failed',
            error_message: error_message || 'Job failed'
          })
        )
      }

      return state
    }

    default:
      return state
  }
}
