import React from 'react'
import PropTypes from 'prop-types'
import Table from 'react-table/index.js'

import { thread_columns } from './column-definitions.js'
import './ThreadsTable.styl'

const ThreadsTable = ({
  data = [],
  table_state = {},
  all_columns = {},
  is_loading = false,
  on_view_change,
  fetch_more,
  can_fetch_more = false,
  table_error = null
}) => {
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
        on_view_change={on_view_change}
        fetch_more={fetch_more}
        can_fetch_more={can_fetch_more}
        is_loading={is_loading}
        disable_rank_aggregation={true}
        disable_splits={true}
      />
    </div>
  )
}

ThreadsTable.propTypes = {
  data: PropTypes.array,
  table_state: PropTypes.object,
  all_columns: PropTypes.object,
  is_loading: PropTypes.bool,
  on_view_change: PropTypes.func,
  fetch_more: PropTypes.func,
  can_fetch_more: PropTypes.bool,
  table_error: PropTypes.string
}

export default ThreadsTable
