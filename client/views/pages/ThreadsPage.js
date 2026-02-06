import React, { useEffect, useCallback, useMemo } from 'react'
import { useDispatch } from 'react-redux'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'

import PageLayout from '@views/layout/PageLayout.js'
import ThreadPage from '@pages/ThreadPage/index.js'
import DirectoryPage from '@pages/DirectoryPage/index.js'
import ThreadsTable from '@views/components/ThreadsTable/index.js'
import { threads_actions } from '@core/threads/actions.js'
import PageHead from '@views/components/PageHead/index.js'
import use_page_meta from '@views/hooks/usePageMeta.js'
import {
  slug_to_view_id,
  view_id_to_slug,
  DEFAULT_THREAD_VIEW_ID
} from '@core/utils/view-url-utils.js'

// UUID pattern: 8-4-4-4-12 hex characters
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Pattern to detect file paths - require a file extension to distinguish from view slugs
// This allows view slugs with slashes (e.g., "archived/2024") while still catching file paths
const FILE_EXTENSION_PATTERN = /\.(md|json|txt|mjs|js|ts|yaml|yml)$/i

const is_file_path = (param) => {
  if (!param) return false
  return FILE_EXTENSION_PATTERN.test(param)
}

const ThreadsPage = () => {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { view_id: url_view_slug } = useParams()
  const [search_params] = useSearchParams()

  // Check if the URL param is a thread UUID (not a view slug)
  const is_thread_uuid = url_view_slug && UUID_PATTERN.test(url_view_slug)

  // Check if the URL param is a file path (not a view slug)
  const is_file = is_file_path(url_view_slug)

  // Convert URL slug to internal view_id
  const url_view_id = url_view_slug ? slug_to_view_id(url_view_slug) : null

  // Determine the resolved view_id to use
  const resolved_view_id = url_view_id || DEFAULT_THREAD_VIEW_ID

  // Read tag filter from URL query params
  // Note: Thread tag filtering will work once thread_tags table is populated
  // by the automatic thread tag evaluation task
  const url_tag_filter = search_params.get('tag')

  // Build additional filters from URL params
  const url_filters = useMemo(() => {
    const filters = []
    if (url_tag_filter) {
      filters.push({
        column_id: 'tags',
        operator: 'IN',
        value: [url_tag_filter]
      })
    }
    return filters
  }, [url_tag_filter])

  const page_meta = use_page_meta({
    custom_title: url_tag_filter ? `Threads - ${url_tag_filter}` : 'Threads',
    custom_description: 'Browse and manage execution threads in the Base system'
  })

  useEffect(() => {
    // Only load thread table data if not viewing a specific thread or file
    if (!is_thread_uuid && !is_file) {
      dispatch(
        threads_actions.select_thread_table_view({ view_id: resolved_view_id })
      )
      dispatch(
        threads_actions.load_threads_table({
          view_id: resolved_view_id,
          url_filters
        })
      )
    }
  }, [dispatch, resolved_view_id, is_thread_uuid, is_file, url_filters])

  // Handle view selection - navigate to new URL
  const handle_view_select = useCallback(
    (view_id) => {
      const slug = view_id_to_slug(view_id)
      navigate(`/thread/${slug}`)
    },
    [navigate]
  )

  // If the param is a thread UUID, render ThreadPage
  if (is_thread_uuid) {
    return <ThreadPage />
  }

  // If the param is a file path, render DirectoryPage
  if (is_file) {
    return <DirectoryPage />
  }

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
          <ThreadsTable on_view_select={handle_view_select} />
        </div>
      </PageLayout>
    </>
  )
}

export default ThreadsPage
