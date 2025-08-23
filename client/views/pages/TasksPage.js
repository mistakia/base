import React, { useEffect } from 'react'
import { useDispatch } from 'react-redux'

import PageLayout from '@views/layout/PageLayout.js'
import TasksTable from '@views/components/TasksTable/index.js'
import { tasks_actions } from '@core/tasks/actions.js'

const TasksPage = () => {
  const dispatch = useDispatch()

  useEffect(() => {
    // Load initial tasks table data
    dispatch(tasks_actions.load_tasks_table())
  }, [dispatch])

  return (
    <PageLayout>
      <div>
        <TasksTable />
      </div>
    </PageLayout>
  )
}

export default TasksPage
