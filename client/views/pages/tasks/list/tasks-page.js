import React, { useEffect } from 'react'
import { Link } from 'react-router-dom'
import PropTypes from 'prop-types'

import Task from '@components/task'

import './tasks-page.styl'

const TasksListPage = ({ tasks = [], load_tasks }) => {
  useEffect(() => {
    load_tasks()
  }, [load_tasks])

  return (
    <div className='page-container'>
      <div className='header'>
        <h1 className='title'>Tasks</h1>
      </div>
      <div className='content-container'>
        <div className='list-container'>
          {tasks.map((task) => (
            <Link
              key={task.task_id}
              to={`/tasks/${task.task_id}`}
              className='task-link'>
              <Task task={task} variant='preview' />
            </Link>
          ))}
          {tasks.length === 0 && (
            <div className='no-tasks'>No tasks available</div>
          )}
        </div>
      </div>
    </div>
  )
}

TasksListPage.propTypes = {
  tasks: PropTypes.array,
  load_tasks: PropTypes.func.isRequired
}

export default TasksListPage
