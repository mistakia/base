import { List, Map } from 'immutable'

import { database_table_actions } from './actions'
import { path_view_actions } from '@core/path-views'

export function database_table_items_reducer(
  state = new Map(),
  { payload, type }
) {
  switch (type) {
    case path_view_actions.SET_DATABASE_VIEW:
      return state.setIn([payload.table_name, 'items'], new List())

    case database_table_actions.GET_DATABASE_FULFILLED:
      return state.set(
        payload.opts.database_table_name,
        new Map({
          ...payload.data.database_table,
          items: new List(),
          columns: new List(payload.data.database_table_columns)
        })
      )

    case database_table_actions.GET_DATABASE_ITEMS_FULFILLED:
      return state.withMutations((state) => {
        payload.data.forEach((item) =>
          state.updateIn(
            [payload.opts.database_table_name, 'items'],
            new List(),
            (list) => list.push(new Map(item))
          )
        )
      })

    default:
      return state
  }
}
