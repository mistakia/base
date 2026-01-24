import React, { useEffect, useCallback } from 'react'
import { useDispatch } from 'react-redux'
import { useParams, useNavigate } from 'react-router-dom'

import PageLayout from '@views/layout/PageLayout.js'
import TasksTable from '@views/components/TasksTable/index.js'
import DirectoryPage from '@pages/DirectoryPage/index.js'
import { tasks_actions } from '@core/tasks/actions.js'
import PageHead from '@views/components/PageHead/index.js'
import use_page_meta from '@views/hooks/usePageMeta.js'
import {
  slug_to_view_id,
  view_id_to_slug,
  DEFAULT_TASK_VIEW_ID
} from '@core/utils/view-url-utils.js'

// Pattern to detect entity paths (files ending in .md or paths with subdirectories)
const is_entity_path = (param) => {
  if (!param) return false
  return param.endsWith('.md') || param.includes('/')
}

const TasksPage = () => {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { view_id: url_view_slug } = useParams()

  // Check if the URL param is an entity path (not a view slug)
  const is_entity = is_entity_path(url_view_slug)

  // Convert URL slug to internal view_id
  const url_view_id = url_view_slug ? slug_to_view_id(url_view_slug) : null

  // Determine the resolved view_id to use
  const resolved_view_id = url_view_id || DEFAULT_TASK_VIEW_ID

  const page_meta = use_page_meta({
    custom_title: 'Tasks',
    custom_description: 'Browse and manage tasks in the Base system'
  })

  useEffect(() => {
    // Only load tasks table data if not viewing a specific entity
    if (!is_entity) {
      dispatch(
        tasks_actions.select_task_table_view({ view_id: resolved_view_id })
      )
      dispatch(tasks_actions.load_tasks_table({ view_id: resolved_view_id }))
    }
  }, [dispatch, resolved_view_id, is_entity])

  // Handle view selection - navigate to new URL
  const handle_view_select = useCallback(
    (view_id) => {
      const slug = view_id_to_slug(view_id)
      navigate(`/task/${slug}`)
    },
    [navigate]
  )

  // If the param is an entity path, render DirectoryPage
  if (is_entity) {
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
          <TasksTable on_view_select={handle_view_select} />
        </div>
      </PageLayout>
    </>
  )
}

export default TasksPage
