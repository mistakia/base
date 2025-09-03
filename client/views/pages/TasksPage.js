import React, { useEffect } from 'react'
import { useDispatch } from 'react-redux'

import PageLayout from '@views/layout/PageLayout.js'
import TasksTable from '@views/components/TasksTable/index.js'
import { tasks_actions } from '@core/tasks/actions.js'
import PageHead from '@views/components/PageHead/index.js'
import use_page_meta from '@views/hooks/usePageMeta.js'

const TasksPage = () => {
  const dispatch = useDispatch()
  const page_meta = use_page_meta({
    custom_title: 'Tasks',
    custom_description: 'Browse and manage tasks in the Base system'
  })

  useEffect(() => {
    // Load initial tasks table data
    dispatch(tasks_actions.load_tasks_table())
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
          <TasksTable />
        </div>
      </PageLayout>
    </>
  )
}

export default TasksPage
