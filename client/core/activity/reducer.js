import { Map, List, fromJS } from 'immutable'

import { activity_action_types } from './actions'

const initial_state = new Map({
  heatmap_data: new List(),
  max_score: 0,
  date_range: new Map({
    start: null,
    end: null
  }),
  is_loading: false,
  error: null,
  last_fetched: null
})

export function activity_reducer(state = initial_state, action) {
  switch (action.type) {
    case activity_action_types.GET_ACTIVITY_HEATMAP_PENDING:
      return state.merge({
        is_loading: true,
        error: null
      })

    case activity_action_types.GET_ACTIVITY_HEATMAP_FULFILLED: {
      const { data } = action.payload
      return state.merge({
        heatmap_data: fromJS(data.data || []),
        max_score: data.max_score || 0,
        date_range: fromJS(data.date_range || {}),
        is_loading: false,
        error: null,
        last_fetched: Date.now()
      })
    }

    case activity_action_types.GET_ACTIVITY_HEATMAP_FAILED:
      return state.merge({
        is_loading: false,
        error: action.payload.error
      })

    default:
      return state
  }
}
