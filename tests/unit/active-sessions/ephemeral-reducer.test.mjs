import { expect } from 'chai'
import { Record, Map } from 'immutable'

// ---------------------------------------------------------------------------
// Action type constants (mirrored from client/core)
// These are inline to avoid importing client .js files that require a bundler.
// ---------------------------------------------------------------------------

const active_sessions_action_types = {
  GET_ACTIVE_SESSIONS_PENDING: 'GET_ACTIVE_SESSIONS_PENDING',
  GET_ACTIVE_SESSIONS_FULFILLED: 'GET_ACTIVE_SESSIONS_FULFILLED',
  GET_ACTIVE_SESSIONS_FAILED: 'GET_ACTIVE_SESSIONS_FAILED',
  ACTIVE_SESSION_STARTED: 'ACTIVE_SESSION_STARTED',
  ACTIVE_SESSION_UPDATED: 'ACTIVE_SESSION_UPDATED',
  ACTIVE_SESSION_ENDED: 'ACTIVE_SESSION_ENDED'
}

const threads_action_types = {
  THREAD_TIMELINE_ENTRY_ADDED: 'THREAD_TIMELINE_ENTRY_ADDED'
}

// ---------------------------------------------------------------------------
// Reducer (mirrored from client/core/active-sessions/reducer.js)
// Thin ephemeral store -- no pending_sessions, ended_sessions, or
// prompt_snippets.
// ---------------------------------------------------------------------------

const ActiveSessionsState = new Record({
  session_data: new Map(),
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
      const session_data = new Map(
        sessions_array.map((session) => [
          session.session_id,
          Map({
            thread_id: session.thread_id || null,
            latest_timeline_event: session.latest_timeline_event || null,
            context_percentage: session.context_percentage || null,
            last_activity_at: session.updated_at || session.started_at || null
          })
        ])
      )
      return state.merge({ session_data, is_loading: false, error: null })
    }

    case active_sessions_action_types.GET_ACTIVE_SESSIONS_FAILED:
      return state.merge({ is_loading: false, error: payload.error })

    case active_sessions_action_types.ACTIVE_SESSION_STARTED: {
      const { session } = payload
      return state.setIn(
        ['session_data', session.session_id],
        Map({
          thread_id: session.thread_id || null,
          latest_timeline_event: session.latest_timeline_event || null,
          context_percentage: session.context_percentage || null,
          last_activity_at: new Date().toISOString()
        })
      )
    }

    case active_sessions_action_types.ACTIVE_SESSION_UPDATED: {
      const { session } = payload
      const existing = state.getIn(['session_data', session.session_id])
      if (existing) {
        let updated = existing
        if (session.thread_id) {
          updated = updated.set('thread_id', session.thread_id)
        }
        if (session.latest_timeline_event) {
          updated = updated.set(
            'latest_timeline_event',
            session.latest_timeline_event
          )
        }
        if (session.context_percentage !== undefined) {
          updated = updated.set(
            'context_percentage',
            session.context_percentage
          )
        }
        updated = updated.set('last_activity_at', new Date().toISOString())
        return state.setIn(['session_data', session.session_id], updated)
      }
      // Upsert for missed STARTED
      return state.setIn(
        ['session_data', session.session_id],
        Map({
          thread_id: session.thread_id || null,
          latest_timeline_event: session.latest_timeline_event || null,
          context_percentage: session.context_percentage || null,
          last_activity_at: new Date().toISOString()
        })
      )
    }

    case active_sessions_action_types.ACTIVE_SESSION_ENDED: {
      const { session_id } = payload
      return state.deleteIn(['session_data', session_id])
    }

    case threads_action_types.THREAD_TIMELINE_ENTRY_ADDED: {
      const { thread_id, entry } = payload
      if (entry.type === 'system') return state
      const session_entry = state
        .get('session_data')
        .findEntry((data) => data.get('thread_id') === thread_id)
      if (session_entry) {
        const [session_id] = session_entry
        return state.setIn(
          ['session_data', session_id, 'latest_timeline_event'],
          entry
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

describe('ephemeral active-sessions reducer', function () {
  describe('initial state', () => {
    it('should have empty session_data, is_loading false, and error null', () => {
      const state = active_sessions_reducer(undefined, { type: '@@INIT' })

      expect(state.get('session_data')).to.be.an.instanceOf(Map)
      expect(state.get('session_data').size).to.equal(0)
      expect(state.get('is_loading')).to.equal(false)
      expect(state.get('error')).to.equal(null)
    })
  })

  describe('state shape has no legacy fields', () => {
    it('should not have pending_sessions, ended_sessions, or prompt_snippets', () => {
      const state = active_sessions_reducer(undefined, { type: '@@INIT' })

      expect(state.has('pending_sessions')).to.be.false
      expect(state.has('ended_sessions')).to.be.false
      expect(state.has('prompt_snippets')).to.be.false
    })
  })

  describe('GET_ACTIVE_SESSIONS_FULFILLED', () => {
    it('should build session_data from API response', () => {
      const action = {
        type: active_sessions_action_types.GET_ACTIVE_SESSIONS_FULFILLED,
        payload: {
          data: [
            {
              session_id: 'sess-1',
              thread_id: 'thread-a',
              latest_timeline_event: { text: 'hello' },
              context_percentage: 42,
              updated_at: '2026-04-12T10:00:00Z',
              started_at: '2026-04-12T09:00:00Z'
            },
            {
              session_id: 'sess-2',
              thread_id: 'thread-b',
              context_percentage: null,
              started_at: '2026-04-12T08:00:00Z'
            }
          ]
        }
      }

      const state = active_sessions_reducer(undefined, action)

      expect(state.get('session_data').size).to.equal(2)
      expect(state.get('is_loading')).to.equal(false)
      expect(state.get('error')).to.equal(null)

      const sess1 = state.getIn(['session_data', 'sess-1'])
      expect(sess1.get('thread_id')).to.equal('thread-a')
      expect(sess1.get('latest_timeline_event')).to.deep.equal({
        text: 'hello'
      })
      expect(sess1.get('context_percentage')).to.equal(42)
      expect(sess1.get('last_activity_at')).to.equal('2026-04-12T10:00:00Z')

      const sess2 = state.getIn(['session_data', 'sess-2'])
      expect(sess2.get('thread_id')).to.equal('thread-b')
      expect(sess2.get('latest_timeline_event')).to.equal(null)
      expect(sess2.get('context_percentage')).to.equal(null)
      // Falls back to started_at when updated_at is missing
      expect(sess2.get('last_activity_at')).to.equal('2026-04-12T08:00:00Z')
    })

    it('should handle empty data array', () => {
      const action = {
        type: active_sessions_action_types.GET_ACTIVE_SESSIONS_FULFILLED,
        payload: { data: [] }
      }

      const state = active_sessions_reducer(undefined, action)
      expect(state.get('session_data').size).to.equal(0)
      expect(state.get('is_loading')).to.equal(false)
    })
  })

  describe('ACTIVE_SESSION_STARTED', () => {
    it('should upsert session data into session_data', () => {
      const action = {
        type: active_sessions_action_types.ACTIVE_SESSION_STARTED,
        payload: {
          session: {
            session_id: 'sess-new',
            thread_id: 'thread-x',
            context_percentage: 15
          }
        }
      }

      const state = active_sessions_reducer(undefined, action)

      expect(state.get('session_data').size).to.equal(1)

      const entry = state.getIn(['session_data', 'sess-new'])
      expect(entry.get('thread_id')).to.equal('thread-x')
      expect(entry.get('context_percentage')).to.equal(15)
      expect(entry.get('latest_timeline_event')).to.equal(null)
      expect(entry.get('last_activity_at')).to.be.a('string')
    })

    it('should overwrite an existing session with the same id', () => {
      let state = active_sessions_reducer(undefined, {
        type: active_sessions_action_types.ACTIVE_SESSION_STARTED,
        payload: {
          session: {
            session_id: 'sess-dup',
            thread_id: 'thread-old',
            context_percentage: 10
          }
        }
      })

      state = active_sessions_reducer(state, {
        type: active_sessions_action_types.ACTIVE_SESSION_STARTED,
        payload: {
          session: {
            session_id: 'sess-dup',
            thread_id: 'thread-new',
            context_percentage: 20
          }
        }
      })

      expect(state.get('session_data').size).to.equal(1)
      expect(state.getIn(['session_data', 'sess-dup', 'thread_id'])).to.equal(
        'thread-new'
      )
    })
  })

  describe('ACTIVE_SESSION_UPDATED', () => {
    it('should merge ephemeral fields on an existing session', () => {
      let state = active_sessions_reducer(undefined, {
        type: active_sessions_action_types.ACTIVE_SESSION_STARTED,
        payload: {
          session: {
            session_id: 'sess-upd',
            thread_id: 'thread-1',
            context_percentage: 10
          }
        }
      })

      const event = { type: 'assistant', text: 'working on it' }
      state = active_sessions_reducer(state, {
        type: active_sessions_action_types.ACTIVE_SESSION_UPDATED,
        payload: {
          session: {
            session_id: 'sess-upd',
            thread_id: 'thread-2',
            latest_timeline_event: event,
            context_percentage: 55
          }
        }
      })

      const entry = state.getIn(['session_data', 'sess-upd'])
      expect(entry.get('thread_id')).to.equal('thread-2')
      expect(entry.get('latest_timeline_event')).to.deep.equal(event)
      expect(entry.get('context_percentage')).to.equal(55)
    })

    it('should not overwrite thread_id when update omits it', () => {
      let state = active_sessions_reducer(undefined, {
        type: active_sessions_action_types.ACTIVE_SESSION_STARTED,
        payload: {
          session: {
            session_id: 'sess-keep',
            thread_id: 'thread-original'
          }
        }
      })

      state = active_sessions_reducer(state, {
        type: active_sessions_action_types.ACTIVE_SESSION_UPDATED,
        payload: {
          session: {
            session_id: 'sess-keep',
            context_percentage: 80
          }
        }
      })

      const entry = state.getIn(['session_data', 'sess-keep'])
      expect(entry.get('thread_id')).to.equal('thread-original')
      expect(entry.get('context_percentage')).to.equal(80)
    })

    it('should upsert when session does not exist (missed STARTED)', () => {
      const state = active_sessions_reducer(undefined, {
        type: active_sessions_action_types.ACTIVE_SESSION_UPDATED,
        payload: {
          session: {
            session_id: 'sess-missed',
            thread_id: 'thread-m',
            context_percentage: 30
          }
        }
      })

      expect(state.get('session_data').size).to.equal(1)
      const entry = state.getIn(['session_data', 'sess-missed'])
      expect(entry.get('thread_id')).to.equal('thread-m')
      expect(entry.get('context_percentage')).to.equal(30)
    })
  })

  describe('ACTIVE_SESSION_ENDED', () => {
    it('should remove the session from session_data', () => {
      let state = active_sessions_reducer(undefined, {
        type: active_sessions_action_types.ACTIVE_SESSION_STARTED,
        payload: {
          session: { session_id: 'sess-end', thread_id: 'thread-e' }
        }
      })
      expect(state.get('session_data').size).to.equal(1)

      state = active_sessions_reducer(state, {
        type: active_sessions_action_types.ACTIVE_SESSION_ENDED,
        payload: { session_id: 'sess-end' }
      })

      expect(state.get('session_data').size).to.equal(0)
    })

    it('should be a no-op for an unknown session_id', () => {
      const state = active_sessions_reducer(undefined, {
        type: active_sessions_action_types.ACTIVE_SESSION_ENDED,
        payload: { session_id: 'sess-ghost' }
      })

      expect(state.get('session_data').size).to.equal(0)
    })
  })

  describe('THREAD_TIMELINE_ENTRY_ADDED', () => {
    it('should find session by thread_id and update latest_timeline_event', () => {
      let state = active_sessions_reducer(undefined, {
        type: active_sessions_action_types.ACTIVE_SESSION_STARTED,
        payload: {
          session: { session_id: 'sess-tl', thread_id: 'thread-tl' }
        }
      })

      const entry = { type: 'assistant', text: 'done' }
      state = active_sessions_reducer(state, {
        type: threads_action_types.THREAD_TIMELINE_ENTRY_ADDED,
        payload: { thread_id: 'thread-tl', entry }
      })

      expect(
        state.getIn(['session_data', 'sess-tl', 'latest_timeline_event'])
      ).to.deep.equal(entry)
    })

    it('should skip system events', () => {
      const original_event = { type: 'user', text: 'original' }

      let state = active_sessions_reducer(undefined, {
        type: active_sessions_action_types.ACTIVE_SESSION_STARTED,
        payload: {
          session: {
            session_id: 'sess-sys',
            thread_id: 'thread-sys',
            latest_timeline_event: original_event
          }
        }
      })

      state = active_sessions_reducer(state, {
        type: threads_action_types.THREAD_TIMELINE_ENTRY_ADDED,
        payload: {
          thread_id: 'thread-sys',
          entry: { type: 'system', text: 'heartbeat' }
        }
      })

      // System event should be ignored; latest_timeline_event stays unchanged
      expect(
        state.getIn(['session_data', 'sess-sys', 'latest_timeline_event'])
      ).to.deep.equal(original_event)
    })

    it('should be a no-op when no session matches the thread_id', () => {
      let state = active_sessions_reducer(undefined, {
        type: active_sessions_action_types.ACTIVE_SESSION_STARTED,
        payload: {
          session: { session_id: 'sess-other', thread_id: 'thread-other' }
        }
      })

      const before = state
      state = active_sessions_reducer(state, {
        type: threads_action_types.THREAD_TIMELINE_ENTRY_ADDED,
        payload: {
          thread_id: 'thread-unknown',
          entry: { type: 'assistant', text: 'hello' }
        }
      })

      expect(state).to.equal(before)
    })
  })
})
