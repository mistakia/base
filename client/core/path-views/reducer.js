import { Map } from 'immutable'

import { path_view_actions } from './actions'
import { database_table_actions } from '@core/database-tables/actions'

export function path_views_reducer(state = new Map(), { payload, type }) {
  switch (type) {
    case path_view_actions.CREATE_PATH_VIEW:
      return state.set(payload.path_view.view_id, new Map(payload.path_view))

    case database_table_actions.GET_DATABASE_FULFILLED:
      return state.withMutations((state) => {
        payload.data.database_table_views.forEach((view) => {
          const { table_state } = view
          const map_view = new Map({
            ...view,
            table_state: new Map(table_state)
          })
          state.set(view.view_id, map_view)
        })
      })

    case path_view_actions.POST_DATABASE_VIEW_FULFILLED:
      return state.set(
        payload.data.view_id,
        new Map({
          ...payload.data,
          table_state: new Map(payload.data.table_state)
        })
      )

    case path_view_actions.DELETE_DATABASE_VIEW_FULFILLED:
      return state.delete(payload.opts.view_id)

    default:
      return state
  }
}
