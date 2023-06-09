import { Record } from 'immutable'

import { app_actions } from './actions'
import { database_table_actions } from '../database-tables/actions'
import { path_view_actions } from '@core/path-views/actions'

const initial_state = new Record({
  is_loaded: false,
  user_id: null,
  username: null,
  public_key: null,
  private_key: null,
  token: null,
  selected_path: {},
  selected_path_view_id: null
})

export function app_reducer(state = initial_state(), { payload, type }) {
  switch (type) {
    case app_actions.APP_LOADED:
      return state.merge({ is_loaded: true })

    case app_actions.LOAD_KEYS:
    case app_actions.LOAD_FROM_PRIVATE_KEY:
    case app_actions.LOAD_FROM_NEW_KEYPAIR:
      return state.merge({
        public_key: payload.public_key,
        private_key: payload.private_key
      })

    case app_actions.POST_USER_FULFILLED:
    case app_actions.POST_USER_SESSION_FULFILLED:
      return state.merge({
        user_id: payload.data.user_id,
        username: payload.data.username,
        token: payload.data.token
      })

    case app_actions.SET_SELECTED_PATH:
      return state.merge({
        selected_path: payload
      })

    case app_actions.SET_SELECTED_PATH_VIEW_ID:
      return state.merge({
        selected_path_view_id: payload.view_id
      })

    case database_table_actions.GET_DATABASE_FULFILLED:
      return state.merge({
        selected_path_view_id: payload.data.database_table_views.length
          ? payload.data.database_table_views[0].view_id
          : null
      })

    case path_view_actions.POST_DATABASE_VIEW_FULFILLED: {
      if (state.get('selected_path_view_id')) {
        return state
      }

      return state.merge({
        selected_path_view_id: payload.data.view_id
      })
    }

    default:
      return state
  }
}
