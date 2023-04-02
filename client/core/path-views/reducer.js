import { Map } from 'immutable'

import { path_view_actions } from './actions'

export function path_views_reducer(state = new Map(), { payload, type }) {
  switch (type) {
    case path_view_actions.SET_DATABASE_VIEW_TABLE_STATE:
      return state.setIn([payload.view_id, 'table_state'], payload.table_state)

    default:
      return state
  }
}
