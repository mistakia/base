import React, { useEffect, useMemo } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import Table from 'react-table/index.js'

import { task_columns } from './column-definitions.js'
import { tasks_actions } from '@core/tasks/actions.js'
import {
  get_tasks_table_props,
  get_task_table_views,
  get_selected_task_table_view,
  get_available_tags_for_filter
} from '@core/tasks/selectors.js'

import '@styles/tasks.styl'
import './TasksTable.styl'

const TasksTable = () => {
  const dispatch = useDispatch()
  const table_props = useSelector(get_tasks_table_props)
  const available_views = useSelector(get_task_table_views)
  const selected_view = useSelector(get_selected_task_table_view)
  const available_tags = useSelector(get_available_tags_for_filter)

  // Load available tags on mount
  useEffect(() => {
    dispatch(tasks_actions.load_available_tags())
  }, [dispatch])
  const {
    data = [],
    table_state = {},
    saved_table_state = {},
    all_columns = {},
    is_loading = false,
    is_fetching = false,
    is_fetching_more = false,
    total_row_count = 0,
    total_rows_fetched = 0,
    table_error = null
  } = table_props

  // Merge available tags into column definitions
  const columns_with_tags = useMemo(() => {
    const base_columns =
      Object.keys(all_columns).length > 0 ? all_columns : task_columns
    if (!base_columns.tags) return base_columns

    return {
      ...base_columns,
      tags: {
        ...base_columns.tags,
        column_values: available_tags
      }
    }
  }, [all_columns, available_tags])

  const handle_view_change = (view) => {
    dispatch(tasks_actions.update_task_table_view({ view }))
  }

  const handle_fetch_more = () => {
    dispatch(
      tasks_actions.load_tasks_table({
        view_id: selected_view?.view_id,
        is_append: true
      })
    )
  }

  const select_view = (viewId) => {
    dispatch(tasks_actions.select_task_table_view({ view_id: viewId }))
    dispatch(tasks_actions.load_tasks_table({ view_id: viewId }))
  }
  if (table_error) {
    return <div className='tasks-table-error'>{table_error}</div>
  }

  return (
    <div className='tasks-table-container'>
      <Table
        data={data}
        all_columns={columns_with_tags}
        table_state={table_state}
        views={available_views}
        selected_view={selected_view}
        on_view_change={handle_view_change}
        select_view={select_view}
        fetch_more={handle_fetch_more}
        total_row_count={total_row_count}
        total_rows_fetched={total_rows_fetched}
        is_loading={is_loading}
        is_fetching={is_fetching}
        is_fetching_more={is_fetching_more}
        saved_table_state={saved_table_state}
        disable_rank_aggregation={true}
        disable_splits={true}
        disable_create_view={true}
        disable_edit_view={true}
      />
    </div>
  )
}

export default TasksTable
