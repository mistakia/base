import { createSelector } from 'reselect'
import {
  calculate_thread_cost,
  format_cost_for_display
} from '@core/utils/pricing-calculator'
import { build_table_props } from '@core/utils/table-view-helpers.js'

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

export function get_thread_table_views(state) {
  const threads_state = get_threads_state(state)
  const views_map = threads_state.get('thread_table_views')

  if (!views_map) return []

  return views_map
    .entrySeq()
    .map(([view_id, view]) => ({
      view_id,
      view_name: view.get('thread_view_name'),
      table_state: view.get('thread_table_state')?.toJS() || {},
      saved_table_state: view.get('saved_table_state')?.toJS() || {}
    }))
    .toArray()
}

export function get_selected_thread_table_view(state) {
  const threads_state = get_threads_state(state)
  const view_id = get_selected_thread_table_view_id(state)
  const view = threads_state.getIn(['thread_table_views', view_id])

  if (!view) return null

  return {
    view_id,
    view_name: view.get('thread_view_name'),
    table_state: view.get('thread_table_state')?.toJS() || {},
    saved_table_state: view.get('saved_table_state')?.toJS() || {}
  }
}

export function get_thread_table_threads(state) {
  const threads_state = get_threads_state(state)
  const view_id = get_selected_thread_table_view_id(state)
  const view = threads_state.getIn(['thread_table_views', view_id])
  return view ? view.get('thread_table_results') : null
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

// Selector to get a thread by ID from any available source
export const get_thread_by_id = createSelector(
  [get_threads_state, (_, thread_id) => thread_id],
  (threads_state, thread_id) => {
    if (!thread_id) return null

    // Check selected_thread_data first
    const selected_thread_data = threads_state.get('selected_thread_data')
    if (
      selected_thread_data &&
      selected_thread_data.get('thread_id') === thread_id
    ) {
      return selected_thread_data.toJS
        ? selected_thread_data.toJS()
        : selected_thread_data
    }

    // Check threads list
    const threads = threads_state.get('threads')
    if (threads) {
      const thread = threads.find((t) => {
        const t_id = t.get ? t.get('thread_id') : t.thread_id
        return t_id === thread_id
      })
      if (thread) {
        return thread.toJS ? thread.toJS() : thread
      }
    }

    // Check thread_table_results
    const selected_view_id =
      threads_state.get('selected_thread_table_view_id') || 'default'
    const selected_view = threads_state.getIn([
      'thread_table_views',
      selected_view_id
    ])
    const thread_table_results = selected_view
      ? selected_view.get('thread_table_results')
      : null

    if (thread_table_results) {
      const thread = thread_table_results.find((t) => t.thread_id === thread_id)
      if (thread) {
        return thread.raw_thread || thread
      }
    }

    return null
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

// Selector to get pending resume state for a specific thread
export function get_thread_pending_resume(state, thread_id) {
  if (!thread_id) return null
  return (
    get_threads_state(state).getIn(['thread_pending_resumes', thread_id]) ||
    null
  )
}

// Memoized selector for thread_all_columns to avoid reference instability
// This ensures the JS object reference only changes when the underlying Immutable data changes
export function get_thread_all_columns_immutable(state) {
  return get_threads_state(state).get('thread_all_columns')
}

export const get_thread_all_columns = createSelector(
  [get_thread_all_columns_immutable],
  (all_columns_immutable) => {
    return all_columns_immutable?.toJS
      ? all_columns_immutable.toJS()
      : all_columns_immutable || {}
  }
)

// Main table props selector that provides all data needed for react-table
export const get_threads_table_props = createSelector(
  [
    get_threads_state,
    get_selected_thread_table_view_id,
    get_thread_all_columns
  ],
  (threads_state, view_id, all_columns_memoized) => {
    // Rows are already enhanced and assigned id in the reducer; avoid extra work
    return build_table_props({
      slice_state: threads_state,
      view_id,
      prefix: 'thread',
      all_columns_key: 'thread_all_columns',
      all_columns_memoized
    })
  }
)
