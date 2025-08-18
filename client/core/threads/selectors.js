import { createSelector } from 'reselect'
import {
  calculate_thread_cost,
  format_cost_for_display
} from '@core/utils/pricing-calculator'
import { enhance_threads_with_percentiles } from '@views/components/ThreadsTable/percentile-calculator.js'

export function get_threads_state(state) {
  return state.get('threads')
}

export function get_threads(state) {
  return get_threads_state(state).get('threads')
}

export function get_table_threads(state) {
  return get_threads_state(state).get('table_threads')
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

// Selector to get cost display for a specific thread by ID (checks both threads and table_threads)
export const get_thread_cost_by_id = createSelector(
  [get_threads_state, (_, thread_id) => thread_id],
  (threads_state, thread_id) => {
    if (!thread_id) return null

    const table_threads = threads_state.get('table_threads')
    const models_data = threads_state.getIn(['models_data', 'data'])

    if (!models_data) return null

    // Look for thread in both threads and table_threads
    let thread = null

    if (table_threads) {
      thread = table_threads.find((t) => t.thread_id === thread_id)
    }

    if (!thread) return null

    // Convert Immutable models_data to plain JS for calculation
    // thread is already a plain object, so no conversion needed
    const thread_metadata = thread.raw_thread
    const models = models_data.toJS ? models_data.toJS() : models_data

    const cost_calculation = calculate_thread_cost(thread_metadata, models)
    return format_cost_for_display(cost_calculation)
  }
)

// Main table props selector that provides all data needed for react-table
export const get_threads_table_props = createSelector(
  [get_threads_state],
  (threads_state) => {
    // Extract all needed data from threads state (using table-specific properties)
    const table_threads = threads_state.get('table_threads')
    const table_state = threads_state.get('table_state')
    const all_columns = threads_state.get('all_columns')
    const total_row_count = threads_state.get('total_row_count')
    const total_rows_fetched = threads_state.get('total_rows_fetched')
    const is_fetching = threads_state.get('is_fetching')
    const is_fetching_more = threads_state.get('is_fetching_more')
    const table_error = threads_state.get('table_error')

    const table_state_js = table_state?.toJS
      ? table_state.toJS()
      : table_state || {}
    const all_columns_js = all_columns?.toJS
      ? all_columns.toJS()
      : all_columns || {}

    const table_threads_js = table_threads?.toJS
      ? table_threads.toJS()
      : table_threads || []

    // Add percentile calculations for cell styling
    const threads_with_percentiles =
      enhance_threads_with_percentiles(table_threads_js)

    return {
      // Table data with percentiles
      data: threads_with_percentiles,

      // Table state
      table_state: table_state_js,

      // Column definitions
      all_columns: all_columns_js,

      // Pagination and loading states
      total_row_count,
      total_rows_fetched,
      is_fetching,
      is_fetching_more,

      // Error state
      table_error,

      // Computed props
      has_data: table_threads_js.length > 0,
      is_loading: is_fetching,
      can_fetch_more: total_rows_fetched < total_row_count
    }
  }
)
