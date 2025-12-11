import { createSelector } from 'reselect'
import { build_table_props } from '@core/utils/table-view-helpers.js'

export const get_app = (state) => state.get('app')
export const get_tasks_state = (state) => state.get('tasks')

export function get_tasks(state) {
  return get_tasks_state(state).get('tasks')
}

export function get_selected_task_table_view_id(state) {
  return get_tasks_state(state).get('selected_task_table_view_id') || 'open'
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
      table_state: view.get('task_table_state')?.toJS() || {},
      saved_table_state: view.get('saved_table_state')?.toJS() || {}
    }))
    .toArray()
}

// Main table props selector that provides all data needed for react-table
export const get_tasks_table_props = createSelector(
  [get_tasks_state, get_selected_task_table_view_id],
  (tasks_state, view_id) => {
    return build_table_props({
      slice_state: tasks_state,
      view_id,
      prefix: 'task',
      all_columns_key: 'task_all_columns',
      data_transform: (rows) =>
        rows.map((task) => ({ ...task, id: task.entity_id }))
    })
  }
)
