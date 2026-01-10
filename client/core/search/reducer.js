import { Record, List, Map } from 'immutable'

import { search_action_types } from './actions.js'

const SearchState = new Record({
  is_open: false,
  query: '',
  results: new Map({
    files: new List(),
    threads: new List(),
    entities: new List()
  }),
  is_loading: false,
  error: null,
  selected_index: 0,
  total: 0
})

export function search_reducer(state = new SearchState(), { payload, type }) {
  switch (type) {
    case search_action_types.OPEN_COMMAND_PALETTE:
      return state.set('is_open', true)

    case search_action_types.CLOSE_COMMAND_PALETTE:
      return new SearchState()

    case search_action_types.SET_SEARCH_QUERY:
      return state.merge({
        query: payload.query,
        selected_index: 0
      })

    case search_action_types.SEARCH_REQUEST:
      return state.merge({
        is_loading: true,
        error: null
      })

    case search_action_types.SEARCH_SUCCESS: {
      const results = payload.results || {}
      return state.merge({
        is_loading: false,
        results: new Map({
          files: new List(results.files || []),
          threads: new List(results.threads || []),
          entities: new List(results.entities || [])
        }),
        total: results.total || 0,
        selected_index: 0
      })
    }

    case search_action_types.SEARCH_FAILURE:
      return state.merge({
        is_loading: false,
        error: payload.error
      })

    case search_action_types.CLEAR_SEARCH:
      return state.merge({
        query: '',
        results: new Map({
          files: new List(),
          threads: new List(),
          entities: new List()
        }),
        selected_index: 0,
        total: 0
      })

    case search_action_types.SET_SELECTED_INDEX:
      return state.set('selected_index', payload.index)

    default:
      return state
  }
}
