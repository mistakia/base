import React, { useEffect } from 'react'
import PropTypes from 'prop-types'
import ImmutablePropTypes from 'react-immutable-proptypes'
import { useParams } from 'react-router-dom'

import {
  subscribe_to_thread,
  unsubscribe_from_thread
} from '@core/websocket/service'
import PageLayout from '@views/layout/PageLayout.js'
import ThreadTimelineView from '@components/ThreadTimelineView/index.js'
import PageHead from '@views/components/PageHead/index.js'
import use_page_meta from '@views/hooks/usePageMeta.js'

const ThreadPage = ({
  thread_data,
  is_loading,
  error,
  load_thread,
  select_thread,
  clear_selected_thread
}) => {
  const { view_id: id } = useParams()
  const thread_data_js = thread_data?.toJS ? thread_data.toJS() : thread_data
  const page_meta = use_page_meta({
    thread_data: thread_data_js,
    custom_title: is_loading ? 'Loading Thread...' : null,
    custom_description: error ? 'Error loading thread content' : null
  })

  useEffect(() => {
    if (id) {
      load_thread(id)
      select_thread(id)
      subscribe_to_thread(id)
    }
  }, [id, load_thread, select_thread])

  useEffect(() => {
    return () => {
      clear_selected_thread()
      if (id) {
        unsubscribe_from_thread(id)
      }
    }
  }, [id, clear_selected_thread])

  if (is_loading) {
    return (
      <>
        <PageHead
          title={page_meta.title}
          description={page_meta.description}
          tags={page_meta.tags}
          url={page_meta.url}
          type={page_meta.type}
          site_name={page_meta.site_name}
        />
        <PageLayout>
          <div className='loading-state'>Loading thread...</div>
        </PageLayout>
      </>
    )
  }

  if (error) {
    return (
      <>
        <PageHead
          title={page_meta.title}
          description={page_meta.description}
          tags={page_meta.tags}
          url={page_meta.url}
          type={page_meta.type}
          site_name={page_meta.site_name}
        />
        <PageLayout>
          <div className='error-state'>
            <h2>Error Loading Thread</h2>
            <p>{error}</p>
          </div>
        </PageLayout>
      </>
    )
  }

  if (!thread_data) {
    return (
      <>
        <PageHead
          title='Thread Not Found - Base'
          description='The requested thread could not be found'
          url={page_meta.url}
          type='website'
        />
        <PageLayout>
          <div className='error-state'>
            <h2>Thread Not Found</h2>
            <p>The requested thread could not be found.</p>
          </div>
        </PageLayout>
      </>
    )
  }

  return (
    <>
      <PageHead
        title={page_meta.title}
        description={page_meta.description}
        tags={page_meta.tags}
        url={page_meta.url}
        image={page_meta.image}
        type={page_meta.type}
        site_name={page_meta.site_name}
        author={page_meta.author}
        published_time={page_meta.published_time}
        modified_time={page_meta.modified_time}
      />
      <PageLayout>
        <ThreadTimelineView />
      </PageLayout>
    </>
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
