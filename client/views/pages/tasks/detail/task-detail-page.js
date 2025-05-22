import React from 'react'
import { useParams } from 'react-router-dom'
import PropTypes from 'prop-types'
import MarkdownContent from '@components/markdown-content'

import '@styles/layout.styl'
import './task-detail-page.styl'

const TaskDetailPage = ({ tasks, load_task }) => {
  const { task_id } = useParams()
  const task = task_id ? tasks.get(task_id) : null

  React.useEffect(() => {
    if (task_id) {
      load_task({ task_id })
    }
  }, [task_id, load_task])

  if (!task) {
    return (
      <div className='page-container'>
        <div className='header'>
          <h1 className='title'>Task</h1>
        </div>
        <div className='content-container'>
          <div className='loading-state'>Loading task...</div>
        </div>
      </div>
    )
  }

  // Convert the Immutable.js record to a plain JavaScript object
  const task_data = task.toJS()

  return (
    <div className='page-container'>
      <div className='header'>
        <h1 className='title'>{task_data.title}</h1>
      </div>
      <div className='content-container'>
        <div className='task-detail-container'>
          <div className='task-detail-header'>
            {task_data.status && (
              <div className='task-status'>{task_data.status}</div>
            )}
            {task_data.priority && (
              <div className='task-priority'>{task_data.priority}</div>
            )}
          </div>

          {task_data.description && (
            <div className='task-description'>
              <MarkdownContent content={task_data.description} />
            </div>
          )}

          <div className='task-actions'>
            {/* Additional actions can be added here */}
          </div>
        </div>
      </div>
    </div>
  )
}

TaskDetailPage.propTypes = {
  tasks: PropTypes.object.isRequired,
  load_task: PropTypes.func.isRequired
}

export default TaskDetailPage
