import { Map } from 'immutable'

import { task_actions } from './actions'
import { create_task } from './models'

const initial_state = new Map()

export default function tasks_reducer(state = initial_state, action) {
  switch (action.type) {
    case task_actions.GET_USER_TASKS_FULFILLED: {
      const { data } = action.payload
      return state.withMutations((map) => {
        data.forEach((task) => map.set(task.task_id, create_task(task)))
      })
    }
    default:
      return state
  }
}
