import { createSelector } from 'reselect'
import {
  calculate_thread_cost,
  format_cost_for_display
} from '@core/utils/pricing-calculator'

export function get_threads_state(state) {
  return state.get('threads')
}

export function get_threads(state) {
  return get_threads_state(state).get('threads')
}

// Cost calculation selectors
export const get_thread_cost = createSelector(
  [get_threads_state],
  (threads_state) => {
    const thread_data = threads_state.get('selected_thread_data')
    const models_data = threads_state.getIn(['models_data', 'data'])

    if (!thread_data || !models_data) {
      return null
    }

    // Convert Immutable objects to plain JS for calculation
    const thread_metadata = thread_data.toJS ? thread_data.toJS() : thread_data
    const models = models_data.toJS ? models_data.toJS() : models_data

    return calculate_thread_cost(thread_metadata, models)
  }
)

export const get_thread_cost_display = createSelector(
  [get_thread_cost],
  (cost_calculation) => {
    return format_cost_for_display(cost_calculation)
  }
)
