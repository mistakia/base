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

export function get_selected_thread_table_view_id(state) {
  return (
    get_threads_state(state).get('selected_thread_table_view_id') || 'default'
  )
}

export function get_selected_thread_table_view(state) {
  const threads_state = get_threads_state(state)
  const view_id = get_selected_thread_table_view_id(state)
  return threads_state.getIn(['thread_table_views', view_id])
}

export function get_thread_table_threads(state) {
  const selected_view = get_selected_thread_table_view(state)
  return selected_view ? selected_view.get('thread_table_results') : null
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

    const selected_view_id =
      threads_state.get('selected_thread_table_view_id') || 'default'
    const selected_view = threads_state.getIn([
      'thread_table_views',
      selected_view_id
    ])
    const thread_table_results = selected_view
      ? selected_view.get('thread_table_results')
      : null
    const models_data = threads_state.getIn(['models_data', 'data'])

    if (!models_data) return null

    // Look for thread in both threads and table_threads
    let thread = null

    if (thread_table_results) {
      thread = thread_table_results.find((t) => t.thread_id === thread_id)
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
  [get_threads_state, get_selected_thread_table_view_id],
  (threads_state, view_id) => {
    const selected_view = threads_state.getIn(['thread_table_views', view_id])
    if (!selected_view) {
      return {
        data: [],
        table_state: {},
        all_columns: {},
        total_row_count: 0,
        total_rows_fetched: 0,
        is_fetching: false,
        is_fetching_more: false,
        table_error: null,
        has_data: false,
        is_loading: false,
        can_fetch_more: false,
        view_id
      }
    }

    // Extract all needed data from selected view
    const thread_table_results = selected_view.get('thread_table_results')
    const thread_table_state = selected_view.get('thread_table_state')
    const thread_all_columns = threads_state.get('thread_all_columns')
    const thread_total_row_count = selected_view.get('thread_total_row_count')
    const thread_total_rows_fetched = selected_view.get(
      'thread_total_rows_fetched'
    )
    const thread_is_fetching = selected_view.get('thread_is_fetching')
    const thread_is_fetching_more = selected_view.get('thread_is_fetching_more')
    const thread_table_error = selected_view.get('thread_table_error')

    const table_state_js = thread_table_state?.toJS
      ? thread_table_state.toJS()
      : thread_table_state || {}
    const all_columns_js = thread_all_columns?.toJS
      ? thread_all_columns.toJS()
      : thread_all_columns || {}

    const table_threads_js = thread_table_results?.toJS
      ? thread_table_results.toJS()
      : thread_table_results || []

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
      total_row_count: thread_total_row_count,
      total_rows_fetched: thread_total_rows_fetched,
      is_fetching: thread_is_fetching,
      is_fetching_more: thread_is_fetching_more,

      // Error state
      table_error: thread_table_error,

      // Computed props
      has_data: table_threads_js.length > 0,
      is_loading: thread_is_fetching,
      can_fetch_more: thread_total_rows_fetched < thread_total_row_count,
      view_id
    }
  }
)
