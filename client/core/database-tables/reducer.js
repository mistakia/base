import { List, Map } from 'immutable'

import { database_table_actions } from './actions'

export function database_table_items_reducer(
  state = new Map(),
  { payload, type }
) {
  switch (type) {
    case database_table_actions.GET_DATABASE_ITEMS_FULFILLED:
      return state.withMutations((state) => {
        payload.data.forEach((item) =>
          state.updateIn(
            [payload.opts.database_table_name],
            new List(),
            (list) => list.push(new Map(item))
          )
        )
      })

    default:
      return state
  }
}
