import { Map, List, fromJS } from 'immutable'

import { task_stats_action_types } from './actions'

const initial_state = new Map({
  summary: null,
  by_tag: new List(),
  completion_series: new List(),
  is_loading: false
})

export function task_stats_reducer(state = initial_state, action) {
  switch (action.type) {
    case task_stats_action_types.GET_TASK_STATS_PENDING:
      return state.set('is_loading', true)

    case task_stats_action_types.GET_TASK_STATS_FULFILLED: {
      const { data } = action.payload
      return state.merge({
        summary: data.summary ? fromJS(data.summary) : null,
        by_tag: fromJS(data.by_tag || []),
        completion_series: fromJS(data.completion_series || []),
        is_loading: false
      })
    }

    case task_stats_action_types.GET_TASK_STATS_FAILED:
      return state.set('is_loading', false)

    default:
      return state
  }
}
