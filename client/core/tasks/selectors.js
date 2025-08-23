import { createSelector } from 'reselect'

export const get_app = (state) => state.get('app')
export const get_tasks_state = (state) => state.get('tasks')

export function get_tasks(state) {
  return get_tasks_state(state).get('tasks')
}

export function get_selected_task_table_view_id(state) {
  return get_tasks_state(state).get('selected_task_table_view_id') || 'default'
}

export function get_selected_task_table_view(state) {
  const tasks_state = get_tasks_state(state)
  const view_id = get_selected_task_table_view_id(state)
  const view_data = tasks_state.getIn(['task_table_views', view_id])

  if (!view_data) return null
  // Return view in the format expected by react-table
  return {
    view_id,
    view_name: view_data.get('task_view_name'),
    view_description: view_data.get('task_view_description'),
    view_search_column_id: view_data.get('view_search_column_id'),
    view_filters: view_data.get('view_filters')?.toJS() || [],
    table_state: view_data.get('task_table_state')?.toJS() || {},
    saved_table_state: view_data.get('saved_table_state')?.toJS() || null
  }
}

export function get_task_table_tasks(state) {
  const tasks_state = get_tasks_state(state)
  const view_id = get_selected_task_table_view_id(state)
  const view_data = tasks_state.getIn(['task_table_views', view_id])
  return view_data ? view_data.get('task_table_results') : null
}

export function get_task_table_views(state) {
  const tasks_state = get_tasks_state(state)
  const views_map = tasks_state.get('task_table_views')

  if (!views_map) return []
  // Convert to array of view objects for react-table
  return views_map
    .entrySeq()
    .map(([view_id, view]) => ({
      view_id,
      view_name: view.get('task_view_name'),
      table_state: view.get('task_table_state')?.toJS() || {}
    }))
    .toArray()
}

// Main table props selector that provides all data needed for react-table
export const get_tasks_table_props = createSelector(
  [get_tasks_state, get_selected_task_table_view_id],
  (tasks_state, view_id) => {
    const selected_view_data = tasks_state.getIn(['task_table_views', view_id])
    if (!selected_view_data) {
      return {
        data: [],
        table_state: {},
        all_columns: {},
        total_row_count: 0,
        total_rows_fetched: 0,
        is_fetching: false,
        is_fetching_more: false,
        can_fetch_more: false,
        table_error: null,
        has_data: false,
        is_loading: false,
        view_id
      }
    }

    // Extract all needed data from selected view
    const task_table_results = selected_view_data.get('task_table_results')
    const task_table_state = selected_view_data.get('task_table_state')
    const task_all_columns = tasks_state.get('task_all_columns')
    const task_total_row_count = selected_view_data.get('task_total_row_count')
    const task_total_rows_fetched = selected_view_data.get(
      'task_total_rows_fetched'
    )
    const task_is_fetching = selected_view_data.get('task_is_fetching')
    const task_is_fetching_more = selected_view_data.get(
      'task_is_fetching_more'
    )
    const task_table_error = selected_view_data.get('task_table_error')

    const table_state_js = task_table_state?.toJS
      ? task_table_state.toJS()
      : task_table_state || {}
    const all_columns_js = task_all_columns?.toJS
      ? task_all_columns.toJS()
      : task_all_columns || {}

    const table_tasks_js = task_table_results?.toJS
      ? task_table_results.toJS()
      : task_table_results || []

    // Ensure each task has an id field using entity_id
    const table_tasks_with_id = table_tasks_js.map((task) => ({
      ...task,
      id: task.entity_id
    }))

    const total_row_count = task_total_row_count || 0
    const total_rows_fetched = task_total_rows_fetched || 0

    return {
      // Table data
      data: table_tasks_with_id,

      // Table state
      table_state: table_state_js,

      // Column definitions
      all_columns: all_columns_js,

      // Pagination and loading states
      total_row_count,
      total_rows_fetched,
      is_fetching: task_is_fetching,
      is_fetching_more: task_is_fetching_more,
      can_fetch_more: total_rows_fetched < total_row_count,

      // Error state
      table_error: task_table_error,

      // Computed props
      has_data: table_tasks_js.length > 0,
      is_loading: task_is_fetching,
      view_id
    }
  }
)
