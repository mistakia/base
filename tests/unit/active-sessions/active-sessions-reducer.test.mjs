import { expect } from 'chai'
import { Record, Map } from 'immutable'

// ---------------------------------------------------------------------------
// Action type constants (mirrored from client/core)
// These are inline to avoid importing client .js files that require a bundler.
// ---------------------------------------------------------------------------

const threads_action_types = {
  CREATE_THREAD_SESSION_PENDING: 'CREATE_THREAD_SESSION_PENDING',
  CREATE_THREAD_SESSION_FULFILLED: 'CREATE_THREAD_SESSION_FULFILLED',
  CREATE_THREAD_SESSION_FAILED: 'CREATE_THREAD_SESSION_FAILED',
  THREAD_JOB_FAILED: 'THREAD_JOB_FAILED',
  THREAD_TIMELINE_ENTRY_ADDED: 'THREAD_TIMELINE_ENTRY_ADDED'
}

const active_sessions_action_types = {
  GET_ACTIVE_SESSIONS_PENDING: 'GET_ACTIVE_SESSIONS_PENDING',
  GET_ACTIVE_SESSIONS_FULFILLED: 'GET_ACTIVE_SESSIONS_FULFILLED',
  GET_ACTIVE_SESSIONS_FAILED: 'GET_ACTIVE_SESSIONS_FAILED',
  ACTIVE_SESSION_STARTED: 'ACTIVE_SESSION_STARTED',
  ACTIVE_SESSION_UPDATED: 'ACTIVE_SESSION_UPDATED',
  ACTIVE_SESSION_ENDED: 'ACTIVE_SESSION_ENDED'
}

// ---------------------------------------------------------------------------
// Reducer (mirrored from client/core/active-sessions/reducer.js)
// ---------------------------------------------------------------------------

const ActiveSessionsState = new Record({
  sessions: new Map(),
  pending_sessions: new Map(),
  is_loading: false,
  error: null
})

function active_sessions_reducer(
  state = new ActiveSessionsState(),
  { payload, type }
) {
  switch (type) {
    case active_sessions_action_types.GET_ACTIVE_SESSIONS_PENDING:
      return state.merge({ is_loading: true, error: null })

    case active_sessions_action_types.GET_ACTIVE_SESSIONS_FULFILLED: {
      const sessions_array = payload.data || []
      const sessions_map = new Map(
        sessions_array.map((session) => [session.session_id, Map(session)])
      )
      return state.merge({
        sessions: sessions_map,
        is_loading: false,
        error: null
      })
    }

    case active_sessions_action_types.GET_ACTIVE_SESSIONS_FAILED:
      return state.merge({ is_loading: false, error: payload.error })

    case active_sessions_action_types.ACTIVE_SESSION_STARTED: {
      const { session } = payload
      const existing_for_seq = state.getIn(['sessions', session.session_id])
      if (existing_for_seq) {
        const existing_seq = existing_for_seq.get('event_seq') || 0
        const incoming_seq = session.event_seq || 0
        if (existing_seq > 0 && existing_seq >= incoming_seq) return state
      }
      if (session.job_id && state.hasIn(['pending_sessions', session.job_id])) {
        return state
          .setIn(['sessions', session.session_id], Map(session))
          .deleteIn(['pending_sessions', session.job_id])
      }
      return state.setIn(['sessions', session.session_id], Map(session))
    }

    case active_sessions_action_types.ACTIVE_SESSION_UPDATED: {
      const { session } = payload
      const stored = state.getIn(['sessions', session.session_id])
      if (stored) {
        const stored_seq = stored.get('event_seq') || 0
        const incoming_seq = session.event_seq || 0
        if (stored_seq > 0 && incoming_seq <= stored_seq) return state
      }
      return state.setIn(['sessions', session.session_id], Map(session))
    }

    case active_sessions_action_types.ACTIVE_SESSION_ENDED: {
      const { session_id } = payload
      return state.deleteIn(['sessions', session_id])
    }

    case threads_action_types.THREAD_TIMELINE_ENTRY_ADDED: {
      const { thread_id, entry } = payload
      if (entry.type === 'system') return state
      const sessions = state.get('sessions')
      const session_entry = sessions.findEntry(
        (session) => session.get('thread_id') === thread_id
      )
      if (session_entry) {
        const [session_id] = session_entry
        return state.setIn(
          ['sessions', session_id, 'latest_timeline_event'],
          entry
        )
      }
      return state
    }

    case threads_action_types.CREATE_THREAD_SESSION_PENDING: {
      const { opts } = payload
      const pending_id = `pending-${Date.now()}`
      const pending_session = Map({
        pending_id,
        status: 'queued',
        prompt_snippet: (opts.prompt || '').slice(0, 120),
        working_directory: opts.working_directory || null,
        created_at: new Date().toISOString()
      })
      return state.setIn(['pending_sessions', pending_id], pending_session)
    }

    case threads_action_types.CREATE_THREAD_SESSION_FULFILLED: {
      const { opts, data } = payload
      const job_id = data?.job_id
      if (!job_id) return state
      const pending_entry = state
        .get('pending_sessions')
        .findEntry(
          (session) =>
            !session.get('job_id') &&
            session.get('prompt_snippet') === (opts.prompt || '').slice(0, 120)
        )
      if (pending_entry) {
        const [old_key, pending_session] = pending_entry
        const updated_session = pending_session.merge({
          job_id,
          queue_position: data.queue_position,
          status: 'queued'
        })
        return state
          .deleteIn(['pending_sessions', old_key])
          .setIn(['pending_sessions', job_id], updated_session)
      }
      return state
    }

    case threads_action_types.CREATE_THREAD_SESSION_FAILED: {
      const { opts, error } = payload
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('active-sessions-reducer', function () {
  describe('pending session lifecycle', () => {
    it('should create a pending session on CREATE_THREAD_SESSION_PENDING', () => {
      const action = {
        type: threads_action_types.CREATE_THREAD_SESSION_PENDING,
        payload: {
          opts: {
            prompt: 'Test prompt for thread creation',
            working_directory: '/tmp/test'
          }
        }
      }

      const state = active_sessions_reducer(undefined, action)
      const pending = state.get('pending_sessions')

      expect(pending.size).to.equal(1)

      const session = pending.first()
      expect(session.get('status')).to.equal('queued')
      expect(session.get('prompt_snippet')).to.equal(
        'Test prompt for thread creation'
      )
      expect(session.get('working_directory')).to.equal('/tmp/test')
      expect(session.get('created_at')).to.be.a('string')
    })

    it('should re-key pending session with job_id on CREATE_THREAD_SESSION_FULFILLED', () => {
      // First create a pending session
      const pending_action = {
        type: threads_action_types.CREATE_THREAD_SESSION_PENDING,
        payload: {
          opts: {
            prompt: 'My prompt',
            working_directory: '/tmp/test'
          }
        }
      }
      let state = active_sessions_reducer(undefined, pending_action)

      // Then fulfill with job_id
      const fulfilled_action = {
        type: threads_action_types.CREATE_THREAD_SESSION_FULFILLED,
        payload: {
          opts: { prompt: 'My prompt', working_directory: '/tmp/test' },
          data: { job_id: 'job-123', queue_position: 1, status: 'queued' }
        }
      }
      state = active_sessions_reducer(state, fulfilled_action)

      const pending = state.get('pending_sessions')
      expect(pending.size).to.equal(1)
      expect(pending.has('job-123')).to.be.true

      const session = pending.get('job-123')
      expect(session.get('job_id')).to.equal('job-123')
      expect(session.get('queue_position')).to.equal(1)
    })

    it('should mark pending session as failed on CREATE_THREAD_SESSION_FAILED', () => {
      const pending_action = {
        type: threads_action_types.CREATE_THREAD_SESSION_PENDING,
        payload: {
          opts: { prompt: 'Failing prompt', working_directory: '/tmp/test' }
        }
      }
      let state = active_sessions_reducer(undefined, pending_action)

      const failed_action = {
        type: threads_action_types.CREATE_THREAD_SESSION_FAILED,
        payload: {
          opts: { prompt: 'Failing prompt', working_directory: '/tmp/test' },
          error: 'Network error'
        }
      }
      state = active_sessions_reducer(state, failed_action)

      const pending = state.get('pending_sessions')
      const session = pending.first()
      expect(session.get('status')).to.equal('failed')
      expect(session.get('error_message')).to.equal('Network error')
    })

    it('should merge pending to active on ACTIVE_SESSION_STARTED with matching job_id', () => {
      // Create a pending session with job_id
      const pending_action = {
        type: threads_action_types.CREATE_THREAD_SESSION_PENDING,
        payload: {
          opts: { prompt: 'Test', working_directory: '/tmp/test' }
        }
      }
      let state = active_sessions_reducer(undefined, pending_action)

      const fulfilled_action = {
        type: threads_action_types.CREATE_THREAD_SESSION_FULFILLED,
        payload: {
          opts: { prompt: 'Test', working_directory: '/tmp/test' },
          data: { job_id: 'job-456', queue_position: 1 }
        }
      }
      state = active_sessions_reducer(state, fulfilled_action)
      expect(state.get('pending_sessions').size).to.equal(1)

      // Now receive ACTIVE_SESSION_STARTED with matching job_id
      const started_action = {
        type: active_sessions_action_types.ACTIVE_SESSION_STARTED,
        payload: {
          session: {
            session_id: 'sess-abc',
            status: 'active',
            job_id: 'job-456',
            working_directory: '/tmp/test'
          }
        }
      }
      state = active_sessions_reducer(state, started_action)

      // Pending should be removed
      expect(state.get('pending_sessions').size).to.equal(0)
      // Active session should exist
      expect(state.getIn(['sessions', 'sess-abc'])).to.not.be.undefined
    })

    it('should mark pending as failed on THREAD_JOB_FAILED with matching job_id', () => {
      const pending_action = {
        type: threads_action_types.CREATE_THREAD_SESSION_PENDING,
        payload: {
          opts: { prompt: 'Test', working_directory: '/tmp/test' }
        }
      }
      let state = active_sessions_reducer(undefined, pending_action)

      const fulfilled_action = {
        type: threads_action_types.CREATE_THREAD_SESSION_FULFILLED,
        payload: {
          opts: { prompt: 'Test', working_directory: '/tmp/test' },
          data: { job_id: 'job-789' }
        }
      }
      state = active_sessions_reducer(state, fulfilled_action)

      const failed_action = {
        type: threads_action_types.THREAD_JOB_FAILED,
        payload: {
          job_id: 'job-789',
          error_message: 'CLI process crashed'
        }
      }
      state = active_sessions_reducer(state, failed_action)

      const session = state.getIn(['pending_sessions', 'job-789'])
      expect(session.get('status')).to.equal('failed')
      expect(session.get('error_message')).to.equal('CLI process crashed')
    })
  })

  describe('event_seq gating', () => {
    const make_session = (overrides = {}) => ({
      session_id: 'sess-seq',
      status: 'active',
      working_directory: '/tmp/seq',
      event_seq: 1,
      ...overrides
    })

    it('discards UPDATED with lower event_seq than stored', () => {
      let state = active_sessions_reducer(undefined, {
        type: active_sessions_action_types.ACTIVE_SESSION_STARTED,
        payload: { session: make_session({ event_seq: 5, status: 'active' }) }
      })

      state = active_sessions_reducer(state, {
        type: active_sessions_action_types.ACTIVE_SESSION_UPDATED,
        payload: { session: make_session({ event_seq: 3, status: 'idle' }) }
      })

      expect(state.getIn(['sessions', 'sess-seq', 'status'])).to.equal('active')
      expect(state.getIn(['sessions', 'sess-seq', 'event_seq'])).to.equal(5)
    })

    it('applies UPDATED with higher event_seq', () => {
      let state = active_sessions_reducer(undefined, {
        type: active_sessions_action_types.ACTIVE_SESSION_STARTED,
        payload: { session: make_session({ event_seq: 2, status: 'active' }) }
      })

      state = active_sessions_reducer(state, {
        type: active_sessions_action_types.ACTIVE_SESSION_UPDATED,
        payload: { session: make_session({ event_seq: 4, status: 'idle' }) }
      })

      expect(state.getIn(['sessions', 'sess-seq', 'status'])).to.equal('idle')
      expect(state.getIn(['sessions', 'sess-seq', 'event_seq'])).to.equal(4)
    })

    it('discards STARTED when an existing session has equal or higher event_seq', () => {
      let state = active_sessions_reducer(undefined, {
        type: active_sessions_action_types.ACTIVE_SESSION_UPDATED,
        payload: { session: make_session({ event_seq: 7, status: 'idle' }) }
      })

      state = active_sessions_reducer(state, {
        type: active_sessions_action_types.ACTIVE_SESSION_STARTED,
        payload: { session: make_session({ event_seq: 2, status: 'active' }) }
      })

      expect(state.getIn(['sessions', 'sess-seq', 'status'])).to.equal('idle')
      expect(state.getIn(['sessions', 'sess-seq', 'event_seq'])).to.equal(7)
    })

    it('discards UPDATED with no event_seq when stored has a positive seq', () => {
      let state = active_sessions_reducer(undefined, {
        type: active_sessions_action_types.ACTIVE_SESSION_STARTED,
        payload: { session: make_session({ event_seq: 4, status: 'active' }) }
      })

      const { event_seq: _drop, ...no_seq } = make_session({ status: 'idle' })
      state = active_sessions_reducer(state, {
        type: active_sessions_action_types.ACTIVE_SESSION_UPDATED,
        payload: { session: no_seq }
      })

      expect(state.getIn(['sessions', 'sess-seq', 'status'])).to.equal('active')
      expect(state.getIn(['sessions', 'sess-seq', 'event_seq'])).to.equal(4)
    })

    it('accepts STARTED when stored has no event_seq (pre-seq rollout)', () => {
      const { event_seq: _drop, ...no_seq } = make_session({ status: 'idle' })
      let state = active_sessions_reducer(undefined, {
        type: active_sessions_action_types.ACTIVE_SESSION_STARTED,
        payload: { session: no_seq }
      })

      state = active_sessions_reducer(state, {
        type: active_sessions_action_types.ACTIVE_SESSION_STARTED,
        payload: { session: make_session({ event_seq: 1, status: 'active' }) }
      })

      expect(state.getIn(['sessions', 'sess-seq', 'status'])).to.equal('active')
      expect(state.getIn(['sessions', 'sess-seq', 'event_seq'])).to.equal(1)
    })
  })
})
