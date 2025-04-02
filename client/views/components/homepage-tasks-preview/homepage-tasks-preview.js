import React from 'react'
import PropTypes from 'prop-types'
import { Link } from 'react-router-dom'

import Task from '@components/task'

import './homepage-tasks-preview.styl'

export default function HomePageTasksPreview({ tasks = [], load_tasks }) {
  React.useEffect(() => {
    load_tasks()
  }, [])

  return (
    <div className='homepage-tasks-preview-container'>
      <div className='homepage-tasks-preview-header'>
        <h2>Recent Tasks</h2>
        <Link to='/tasks' className='view-all-link'>
          View All
        </Link>
      </div>
      <div className='homepage-tasks-preview-list'>
        {tasks.map((task) => (
          <Task key={task.task_id} task={task} variant='preview' />
        ))}
        {tasks.length === 0 && (
          <div className='no-tasks'>No tasks available</div>
        )}
      </div>
    </div>
  )
}

HomePageTasksPreview.propTypes = {
  tasks: PropTypes.arrayOf(
    PropTypes.shape({
      task_id: PropTypes.string.isRequired,
      title: PropTypes.string.isRequired,
      description: PropTypes.string,
      status: PropTypes.string,
      priority: PropTypes.string,
      created_at: PropTypes.string,
      updated_at: PropTypes.string
    })
  ),
  load_tasks: PropTypes.func.isRequired
}
