import { List, Map } from 'immutable'

import { task_actions } from './actions'

export function tasks_reducer(state = new List(), { payload, type }) {
  switch (type) {
    case task_actions.GET_TASKS_FULFILLED:
      return state.withMutations((state) => {
        payload.data.forEach((parcel) => state.push(new Map(parcel)))
      })

    default:
      return state
  }
}
