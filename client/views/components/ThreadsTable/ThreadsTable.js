import React from 'react'
import PropTypes from 'prop-types'
import { useSelector, useDispatch } from 'react-redux'
import Table from 'react-table/index.js'

import { thread_columns } from './column-definitions.js'
import { threads_actions } from '@core/threads/actions.js'
import {
  get_threads_table_props,
  get_thread_table_views,
  get_selected_thread_table_view
} from '@core/threads/selectors.js'
import './ThreadsTable.styl'

const ThreadsTable = ({ on_view_select }) => {
  const dispatch = useDispatch()
  const table_props = useSelector(get_threads_table_props)
  const available_views = useSelector(get_thread_table_views)
  const selected_view = useSelector(get_selected_thread_table_view)

  const {
    data = [],
    table_state = {},
    saved_table_state = {},
    all_columns = {},
    is_loading = false,
    table_error = null
  } = table_props

  const handle_view_change = (view) => {
    dispatch(
      threads_actions.update_thread_table_view({
        view
      })
    )
  }

  const handle_select_view = (view_id) => {
    // Navigate to URL if callback provided
    if (on_view_select) {
      on_view_select(view_id)
    }
    dispatch(threads_actions.select_thread_table_view({ view_id }))
    dispatch(threads_actions.load_threads_table({ view_id }))
  }

  const handle_fetch_more = () => {
    dispatch(
      threads_actions.load_threads_table({
        view_id: selected_view?.view_id,
        is_append: true
      })
    )
  }

  const handle_reset_cache = () => {
    dispatch(
      threads_actions.load_threads_table({
        view_id: selected_view?.view_id
      })
    )
  }

  if (table_error) {
    return (
      <div className='threads-table-error'>
        <span>Error loading threads: {table_error}</span>
      </div>
    )
  }

  return (
    <div className='threads-table-container'>
      <Table
        data={data}
        all_columns={
          Object.keys(all_columns).length > 0 ? all_columns : thread_columns
        }
        table_state={table_state}
        saved_table_state={saved_table_state}
        views={available_views}
        selected_view={selected_view}
        on_view_change={handle_view_change}
        select_view={handle_select_view}
        fetch_more={handle_fetch_more}
        total_row_count={table_props.total_row_count}
        total_rows_fetched={table_props.total_rows_fetched}
        is_loading={is_loading}
        is_fetching={table_props.is_fetching}
        is_fetching_more={table_props.is_fetching_more}
        reset_cache={handle_reset_cache}
        disable_rank_aggregation={true}
        disable_splits={true}
        disable_create_view={true}
        disable_edit_view={true}
      />
    </div>
  )
}

ThreadsTable.propTypes = {
  on_view_select: PropTypes.func
}

export default ThreadsTable
