import React, { useEffect } from 'react'
import PropTypes from 'prop-types'
import ImmutablePropTypes from 'react-immutable-proptypes'
import { useParams } from 'react-router-dom'

import PageLayout from '@views/layout/PageLayout.js'
import ThreadTimelineView from '@components/ThreadTimelineView/index.js'
import FileSystemBrowser from '@components/FileSystemBrowser/index.js'

const ThreadPage = ({
  thread_data,
  is_loading,
  error,
  load_thread,
  select_thread,
  clear_selected_thread
}) => {
  const { id } = useParams()

  useEffect(() => {
    if (id) {
      load_thread(id)
      select_thread(id)
    }
  }, [id, load_thread, select_thread])

  useEffect(() => {
    return () => {
      clear_selected_thread()
    }
  }, [clear_selected_thread])

  if (is_loading) {
    return (
      <PageLayout>
        <div className='loading-state'>Loading thread...</div>
      </PageLayout>
    )
  }

  if (error) {
    return (
      <PageLayout>
        <div className='error-state'>
          <h2>Error Loading Thread</h2>
          <p>{error}</p>
        </div>
      </PageLayout>
    )
  }

  if (!thread_data) {
    return (
      <PageLayout>
        <div className='error-state'>
          <h2>Thread Not Found</h2>
          <p>The requested thread could not be found.</p>
        </div>
      </PageLayout>
    )
  }

  return (
    <PageLayout>
      <ThreadTimelineView />
      <FileSystemBrowser />
    </PageLayout>
  )
}

ThreadPage.propTypes = {
  thread_data: ImmutablePropTypes.map,
  is_loading: PropTypes.bool.isRequired,
  error: PropTypes.string,
  load_thread: PropTypes.func.isRequired,
  select_thread: PropTypes.func.isRequired,
  clear_selected_thread: PropTypes.func.isRequired
}

export default ThreadPage
