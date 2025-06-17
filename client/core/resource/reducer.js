import { Map } from 'immutable'

import { resource_actions } from './actions.js'
import { create_resource_state, create_resource } from './models.js'

const initial_state = create_resource_state()

const resourceReducer = (state = initial_state, { payload, type }) => {
  switch (type) {
    case resource_actions.GET_RESOURCE_PENDING:
      return state
        .set('loading', true)
        .set('error', null)
        .setIn(['resources', payload.base_uri, 'loading'], true)
        .setIn(['resources', payload.base_uri, 'error'], null)

    case resource_actions.GET_RESOURCE_FULFILLED: {
      const { opts, data } = payload
      const { base_uri } = opts
      const resource = create_resource({
        base_uri,
        ...data,
        loading: false,
        error: null,
        last_fetched: Date.now()
      })

      return state
        .set('loading', false)
        .set('error', null)
        .setIn(['resources', base_uri], resource)
    }

    case resource_actions.GET_RESOURCE_FAILED:
      return state
        .set('loading', false)
        .set('error', payload.error)
        .setIn(['resources', payload.base_uri, 'loading'], false)
        .setIn(['resources', payload.base_uri, 'error'], payload.error)

    case resource_actions.TOGGLE_DIRECTORY: {
      const { base_uri } = payload
      const is_expanded = state.get('expanded_directories').has(base_uri)

      return state.update('expanded_directories', (dirs) =>
        is_expanded ? dirs.delete(base_uri) : dirs.add(base_uri)
      )
    }

    case resource_actions.CLEAR_RESOURCE: {
      const { base_uri } = payload
      if (!base_uri) return state

      return state.deleteIn(['resources', base_uri])
    }

    case resource_actions.CLEAR_ALL_RESOURCES:
      return state
        .set('resources', new Map())
        .set('expanded_directories', new Set())

    default:
      return state
  }
}

export default resourceReducer
