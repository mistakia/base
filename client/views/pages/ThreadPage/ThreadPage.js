import React, { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'

import { threads_actions } from '@core/threads/actions'
import {
  get_thread_cache_data,
  get_thread_loading_state
} from '@core/threads/selectors'
import { get_active_session_for_thread } from '@core/active-sessions/selectors'
import {
  subscribe_to_thread,
  unsubscribe_from_thread
} from '@core/websocket/service'
import { extract_user_public_key } from '@views/utils/thread-metadata-extractor.js'
import PageLayout from '@views/layout/PageLayout.js'
import ThreadTimelineView from '@components/ThreadTimelineView/index.js'
import ThreadInputTrigger from '@components/ThreadInputTrigger/ThreadInputTrigger.js'
import PageHead from '@views/components/PageHead/index.js'
import use_page_meta from '@views/hooks/usePageMeta.js'
import use_dynamic_favicon from '@views/hooks/use-dynamic-favicon.js'

const ThreadPage = () => {
  const { '*': id } = useParams()
  const dispatch = useDispatch()

  const thread_data = useSelector((state) =>
    id ? get_thread_cache_data(state, id) : null
  )
  const loading_state = useSelector((state) =>
    id ? get_thread_loading_state(state, id) : null
  )
  const is_loading = loading_state?.get('is_loading') || false
  const error = loading_state?.get('error') || null

  const active_session = useSelector((state) =>
    id ? get_active_session_for_thread(state, id) : null
  )

  const thread_data_js = thread_data?.toJS ? thread_data.toJS() : thread_data
  const is_waiting = active_session?.status === 'idle'
  const page_meta = use_page_meta({
    thread_data: thread_data_js,
    custom_title: is_loading
      ? 'Loading Thread...'
      : is_waiting
        ? `[Waiting] ${thread_data_js?.title || 'Thread'}`
        : null,
    custom_description: error ? 'Error loading thread content' : null
  })
  use_dynamic_favicon(is_waiting)

  useEffect(() => {
    if (id) {
      dispatch(threads_actions.load_thread(id))
      subscribe_to_thread(id)
    }

    return () => {
      if (id) {
        unsubscribe_from_thread(id)
      }
    }
  }, [id, dispatch])

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
        <div className='thread-page__input-trigger'>
          <div className='thread-page__input-trigger-inner'>
            <ThreadInputTrigger
              thread_id={id}
              thread_user_public_key={extract_user_public_key(thread_data)}
            />
          </div>
        </div>
      </PageLayout>
    </>
  )
}

export default ThreadPage
