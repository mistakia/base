import React, { useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'

import PageLayout from '@views/layout/PageLayout.js'
import ThreadsTable from '@views/components/ThreadsTable/index.js'
import { threads_actions } from '@core/threads/actions.js'
import { get_threads_table_props } from '@core/threads/selectors.js'

const ThreadsPage = () => {
  const dispatch = useDispatch()

  const table_props = useSelector(get_threads_table_props)

  useEffect(() => {
    // Load initial threads table data with default state
    dispatch(
      threads_actions.load_threads_table({
        table_state: null, // will use default from reducer
        limit: 50,
        offset: 0,
        user_public_key: null,
        is_append: false
      })
    )
  }, [dispatch])

  const handle_table_state_change = (new_table_state) => {
    dispatch(threads_actions.update_threads_table_state(new_table_state))
  }

  const handle_fetch_more = () => {
    const { table_state, total_rows_fetched } = table_props
    dispatch(
      threads_actions.load_threads_table({
        table_state,
        limit: 50,
        offset: total_rows_fetched,
        user_public_key: null,
        is_append: true
      })
    )
  }

  return (
    <PageLayout>
      <div>
        <ThreadsTable
          {...table_props}
          on_view_change={handle_table_state_change}
          fetch_more={handle_fetch_more}
        />
      </div>
    </PageLayout>
  )
}

export default ThreadsPage
