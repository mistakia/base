import { Record, List, Map } from 'immutable'

import { search_action_types } from './actions.js'

/**
 * Derive search mode and stripped query from raw query input.
 * '#' prefix -> content mode, '?' prefix -> semantic mode, else default.
 */
function derive_search_mode(query) {
  if (query.startsWith('#')) {
    return { search_mode: 'content', stripped_query: query.slice(1).trim() }
  }
  if (query.startsWith('?')) {
    return { search_mode: 'semantic', stripped_query: query.slice(1).trim() }
  }
  return { search_mode: 'default', stripped_query: query }
}

const SearchState = new Record({
  is_open: false,
  query: '',
  search_mode: 'default',
  stripped_query: '',
  results: new Map({
    files: new List(),
    threads: new List(),
    entities: new List(),
    directories: new List()
  }),
  content_results: new List(),
  semantic_results: new List(),
  semantic_available: true,
  is_loading: false,
  error: null,
  selected_index: 0,
  total: 0,
  recent_files: new List(),
  recent_files_loading: false,
  recent_files_loaded: false,
  recent_files_error: null
})

export function search_reducer(state = new SearchState(), { payload, type }) {
  switch (type) {
    case search_action_types.OPEN_COMMAND_PALETTE:
      return state.set('is_open', true)

    case search_action_types.CLOSE_COMMAND_PALETTE:
      return new SearchState()

    case search_action_types.SET_SEARCH_QUERY: {
      const { search_mode, stripped_query } = derive_search_mode(payload.query)
      return state.merge({
        query: payload.query,
        search_mode,
        stripped_query,
        selected_index: 0
      })
    }

    case search_action_types.SEARCH_REQUEST:
      return state.merge({
        is_loading: true,
        error: null
      })

    case search_action_types.SEARCH_SUCCESS: {
      const results = payload.results || {}
      const mode = results.mode

      if (mode === 'content') {
        return state.merge({
          is_loading: false,
          content_results: new List(results.content_results || []),
          total: results.total || 0,
          selected_index: 0
        })
      }

      if (mode === 'semantic') {
        return state.merge({
          is_loading: false,
          semantic_results: new List(results.semantic_results || []),
          semantic_available: results.available !== false,
          total: results.total || 0,
          selected_index: 0
        })
      }

      return state.merge({
        is_loading: false,
        results: new Map({
          files: new List(results.files || []),
          threads: new List(results.threads || []),
          entities: new List(results.entities || []),
          directories: new List(results.directories || [])
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
        search_mode: 'default',
        stripped_query: '',
        results: new Map({
          files: new List(),
          threads: new List(),
          entities: new List(),
          directories: new List()
        }),
        content_results: new List(),
        semantic_results: new List(),
        semantic_available: true,
        selected_index: 0,
        total: 0
      })

    case search_action_types.SET_SELECTED_INDEX:
      return state.set('selected_index', payload.index)

    case search_action_types.FETCH_RECENT_FILES_REQUEST:
      return state.merge({
        recent_files_loading: true,
        recent_files_error: null
      })

    case search_action_types.FETCH_RECENT_FILES_SUCCESS:
      return state.merge({
        recent_files: new List(payload.files || []),
        recent_files_loading: false,
        recent_files_loaded: true
      })

    case search_action_types.FETCH_RECENT_FILES_FAILURE:
      return state.merge({
        recent_files_loading: false,
        recent_files_error: payload.error
      })

    default:
      return state
  }
}
