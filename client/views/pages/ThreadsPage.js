import React, { useEffect } from 'react'
import { useDispatch } from 'react-redux'

import PageLayout from '@views/layout/PageLayout.js'
import ThreadsTable from '@views/components/ThreadsTable/index.js'
import { threads_actions } from '@core/threads/actions.js'
import PageHead from '@views/components/PageHead/index.js'
import use_page_meta from '@views/hooks/usePageMeta.js'

const ThreadsPage = () => {
  const dispatch = useDispatch()
  const page_meta = use_page_meta({
    custom_title: 'Threads',
    custom_description: 'Browse and manage execution threads in the Base system'
  })

  useEffect(() => {
    // Load initial threads table data
    dispatch(threads_actions.load_threads_table())
  }, [dispatch])

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
        <div>
          <ThreadsTable />
        </div>
      </PageLayout>
    </>
  )
}

export default ThreadsPage
