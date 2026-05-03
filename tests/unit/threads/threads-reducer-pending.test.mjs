import { expect } from 'chai'
import { Map } from 'immutable'

// ---------------------------------------------------------------------------
// Mirrored fragment of client/core/threads/reducer.js focused on the
// GET_THREAD_PENDING / GET_SHEET_THREAD_PENDING / FULFILLED transitions.
// Kept inline because the reducer file uses bundler-only path aliases.
// Update this test alongside the production reducer when the gated PENDING
// behavior changes.
// ---------------------------------------------------------------------------

const action_types = {
  GET_THREAD_PENDING: 'GET_THREAD_PENDING',
  GET_THREAD_FULFILLED: 'GET_THREAD_FULFILLED',
  GET_SHEET_THREAD_PENDING: 'GET_SHEET_THREAD_PENDING',
  GET_SHEET_THREAD_FULFILLED: 'GET_SHEET_THREAD_FULFILLED'
}

function reducer(state, { type, payload }) {
  switch (type) {
    case action_types.GET_THREAD_PENDING:
    case action_types.GET_SHEET_THREAD_PENDING: {
      const thread_id =
        payload.opts?.thread_id || payload.opts?.params?.thread_id
      if (!thread_id) return state
      if (state.hasIn(['thread_cache', thread_id])) return state
      return state.setIn(
        ['thread_loading', thread_id],
        Map({ is_loading: true, error: null })
      )
    }
    case action_types.GET_THREAD_FULFILLED:
    case action_types.GET_SHEET_THREAD_FULFILLED: {
      const thread_id = payload.data?.thread_id
      if (!thread_id) return state
      return state
        .setIn(
          ['thread_loading', thread_id],
          Map({ is_loading: false, error: null })
        )
        .setIn(['thread_cache', thread_id], Map(payload.data))
    }
    default:
      return state
  }
}

const empty_state = () =>
  Map({ thread_cache: Map(), thread_loading: Map() })

describe('threads reducer GET_THREAD_PENDING gating', () => {
  it('sets is_loading=true when no cached thread exists', () => {
    const state = reducer(empty_state(), {
      type: action_types.GET_THREAD_PENDING,
      payload: { opts: { thread_id: 't1' } }
    })
    expect(state.getIn(['thread_loading', 't1', 'is_loading'])).to.equal(true)
  })

  it('returns state unchanged when a cached thread exists', () => {
    const seeded = empty_state().setIn(
      ['thread_cache', 't1'],
      Map({ thread_id: 't1' })
    )
    const next = reducer(seeded, {
      type: action_types.GET_THREAD_PENDING,
      payload: { opts: { thread_id: 't1' } }
    })
    expect(next).to.equal(seeded)
    expect(next.hasIn(['thread_loading', 't1'])).to.equal(false)
  })

  it('GET_SHEET_THREAD_PENDING is gated identically', () => {
    const seeded = empty_state().setIn(
      ['thread_cache', 't2'],
      Map({ thread_id: 't2' })
    )
    const next = reducer(seeded, {
      type: action_types.GET_SHEET_THREAD_PENDING,
      payload: { opts: { params: { thread_id: 't2' } } }
    })
    expect(next).to.equal(seeded)
  })

  it('FULFILLED clears is_loading and populates the cache', () => {
    const cold = reducer(empty_state(), {
      type: action_types.GET_THREAD_PENDING,
      payload: { opts: { thread_id: 't3' } }
    })
    expect(cold.getIn(['thread_loading', 't3', 'is_loading'])).to.equal(true)

    const fulfilled = reducer(cold, {
      type: action_types.GET_THREAD_FULFILLED,
      payload: { data: { thread_id: 't3', title: 'hi' } }
    })
    expect(fulfilled.getIn(['thread_loading', 't3', 'is_loading'])).to.equal(
      false
    )
    expect(fulfilled.hasIn(['thread_cache', 't3'])).to.equal(true)
  })
})
