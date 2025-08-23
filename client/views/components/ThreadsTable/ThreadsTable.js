import React from 'react'
import { useSelector, useDispatch } from 'react-redux'
import Table from 'react-table/index.js'

import { thread_columns } from './column-definitions.js'
import { threads_actions } from '@core/threads/actions.js'
import { get_threads_table_props } from '@core/threads/selectors.js'
import './ThreadsTable.styl'

const ThreadsTable = () => {
  const dispatch = useDispatch()
  const table_props = useSelector(get_threads_table_props)

  const {
    data = [],
    table_state = {},
    all_columns = {},
    is_loading = false,
    can_fetch_more = false,
    table_error = null
  } = table_props

  const handle_view_change = (view) => {
    dispatch(
      threads_actions.update_threads_table_state({
        view
      })
    )
  }

  const handle_fetch_more = () => {
    dispatch(threads_actions.load_threads_table({ is_append: true }))
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
        views={[]} // No view saving in initial implementation
        on_view_change={handle_view_change}
        fetch_more={handle_fetch_more}
        can_fetch_more={can_fetch_more}
        is_loading={is_loading}
        disable_rank_aggregation={true}
        disable_splits={true}
      />
    </div>
  )
}

export default ThreadsTable
