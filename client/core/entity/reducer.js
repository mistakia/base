import { Map } from 'immutable'

import { entity_actions } from './actions'
import { create_entity } from './models'

const initial_state = new Map()

/**
 * Entity reducer for handling entity state
 *
 * @param {Object} state - Current state
 * @param {Object} action - Dispatched action
 * @returns {Object} New state
 */
export default function entity_reducer(state = initial_state, action) {
  switch (action.type) {
    case entity_actions.GET_ENTITY_FULFILLED: {
      const { opts, data } = action.payload
      const { base_relative_path } = opts
      return state.set(base_relative_path, create_entity(data))
    }
    default:
      return state
  }
}
