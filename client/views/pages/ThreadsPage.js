import React, { useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'

import PageLayout from '@views/layout/PageLayout.js'
import ThreadsTable from '@views/components/ThreadsTable/index.js'
import { threads_actions } from '@core/threads/actions.js'
import { get_threads_state } from '@core/threads/selectors.js'

const ThreadsPage = () => {
  const dispatch = useDispatch()

  const threads_state = useSelector(get_threads_state)
  const threads = threads_state.get('threads')
  const is_loading = threads_state.get('is_loading_threads')

  useEffect(() => {
    dispatch(threads_actions.load_threads())
  }, [dispatch])

  return (
    <PageLayout>
      <div>
        <ThreadsTable threads={threads} is_loading={is_loading} />
      </div>
    </PageLayout>
  )
}

export default ThreadsPage
