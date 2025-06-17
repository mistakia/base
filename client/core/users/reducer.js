import { Map, List } from 'immutable'

import { user_actions } from './actions'

export function users_reducer(state = new Map(), { payload, type }) {
  switch (type) {
    case user_actions.GET_USER_PENDING:
      return state.set(
        payload.opts.username,
        new Map({
          is_loaded: false,
          username: payload.opts.username
        })
      )

    case user_actions.GET_USER_FAILED:
      return state.setIn([payload.opts.username, 'is_loaded'], true)

    case user_actions.GET_USER_FULFILLED:
      return state.mergeIn([payload.data.username], {
        is_loaded: true,
        ...payload.data
      })

    case user_actions.GET_USERS_PENDING:
      return state.set('is_loading_users', true)

    case user_actions.GET_USERS_FAILED:
      return state.merge({
        is_loading_users: false,
        users_error: payload.error
      })

    case user_actions.GET_USERS_FULFILLED:
      return state.merge({
        is_loading_users: false,
        users_list: new List(payload.data),
        users_error: null
      })

    default:
      return state
  }
}
