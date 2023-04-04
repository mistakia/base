import { Map } from 'immutable'

import { path_view_actions } from './actions'
import { database_table_actions } from '@core/database-tables/actions'

export function path_views_reducer(state = new Map(), { payload, type }) {
  switch (type) {
    case path_view_actions.SET_DATABASE_VIEW_TABLE_STATE:
      return state.setIn([payload.view_id, 'table_state'], payload.table_state)

    case path_view_actions.CREATE_PATH_VIEW:
      return state.set(payload.path_view.view_id, new Map(payload.path_view))

    case database_table_actions.GET_DATABASE_FULFILLED:
      return state.withMutations((state) => {
        payload.data.database_table_views.forEach((view) => {
          state.set(view.view_id, new Map(view))
        })
      })

    default:
      return state
  }
}
