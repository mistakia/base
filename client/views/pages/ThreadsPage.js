import React, { useEffect } from 'react'
import { useDispatch } from 'react-redux'

import PageLayout from '@views/layout/PageLayout.js'
import ThreadsTable from '@views/components/ThreadsTable/index.js'
import { threads_actions } from '@core/threads/actions.js'

const ThreadsPage = () => {
  const dispatch = useDispatch()

  useEffect(() => {
    // Load initial threads table data
    dispatch(threads_actions.load_threads_table())
  }, [dispatch])

  return (
    <PageLayout>
      <div>
        <ThreadsTable />
      </div>
    </PageLayout>
  )
}

export default ThreadsPage
