import { Map, Set } from 'immutable'

import { directories_actions } from './actions'
import {
  create_directory,
  create_file,
  create_file_content,
  create_directory_state,
  create_file_content_state
} from './models'

const initial_state = new Map({
  directories_state: new Map(), // keyed by 'type:path'
  expanded_directories: new Set(),
  file_content_state: create_file_content_state()
})

/**
 * Directories reducer for handling directory and file state
 *
 * @param {Object} state - Current state
 * @param {Object} action - Dispatched action
 * @returns {Object} New state
 */
export default function directories_reducer(state = initial_state, action) {
  switch (action.type) {
    case directories_actions.GET_DIRECTORIES_PENDING: {
      const { opts } = action.payload
      const { type, path } = opts
      const cache_key = `${type}:${path || ''}`

      const current_state =
        state.getIn(['directories_state', cache_key]) ||
        create_directory_state()

      return state.setIn(
        ['directories_state', cache_key],
        current_state.set('loading', true).set('error', null)
      )
    }

    case directories_actions.GET_DIRECTORIES_FULFILLED: {
      const { opts, data } = action.payload
      const { type, path } = opts
      const cache_key = `${type}:${path || ''}`

      const directories = (data.directories || []).map((dir) =>
        create_directory(dir)
      )
      const files = (data.files || []).map((file) => create_file(file))

      const directory_state = create_directory_state({
        directories,
        files,
        loading: false,
        error: null
      })

      return state.setIn(['directories_state', cache_key], directory_state)
    }

    case directories_actions.GET_DIRECTORIES_REJECTED: {
      const { opts, error } = action.payload
      const { type, path } = opts
      const cache_key = `${type}:${path || ''}`

      const current_state =
        state.getIn(['directories_state', cache_key]) ||
        create_directory_state()

      return state.setIn(
        ['directories_state', cache_key],
        current_state
          .set('loading', false)
          .set('error', error.message || 'Failed to load directory')
      )
    }

    case directories_actions.TOGGLE_DIRECTORY: {
      const { type, path } = action.payload
      const cache_key = `${type}:${path}`
      const expanded = state.get('expanded_directories')

      const new_expanded = expanded.has(cache_key)
        ? expanded.delete(cache_key)
        : expanded.add(cache_key)

      return state.set('expanded_directories', new_expanded)
    }

    case directories_actions.GET_FILE_CONTENT_PENDING: {
      return state.setIn(
        ['file_content_state'],
        create_file_content_state({ loading: true, error: null })
      )
    }

    case directories_actions.GET_FILE_CONTENT_FULFILLED: {
      const { data } = action.payload
      const file_content = create_file_content(data)

      return state.setIn(
        ['file_content_state'],
        create_file_content_state({
          file_data: file_content,
          loading: false,
          error: null
        })
      )
    }

    case directories_actions.GET_FILE_CONTENT_REJECTED: {
      const { error } = action.payload

      return state.setIn(
        ['file_content_state'],
        create_file_content_state({
          loading: false,
          error: error.message || 'Failed to load file content'
        })
      )
    }

    case directories_actions.CLEAR_FILE_CONTENT: {
      return state.setIn(['file_content_state'], create_file_content_state())
    }

    default:
      return state
  }
}
