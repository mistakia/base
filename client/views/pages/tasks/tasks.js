import React from 'react'
import PropTypes from 'prop-types'

import Task from '@components/task'

import './tasks.styl'

export default function TasksPage({ tasks = [], load_tasks }) {
  React.useEffect(() => {
    load_tasks()
  }, [])

  return (
    <div className='tasks-container'>
      <h1>Tasks</h1>
      <div className='tasks-list'>
        {tasks.map((task) => (
          <Task key={task.task_id} task={task} />
        ))}
        {tasks.length === 0 && (
          <div className='no-tasks'>No tasks available</div>
        )}
      </div>
    </div>
  )
}

TasksPage.propTypes = {
  tasks: PropTypes.array,
  load_tasks: PropTypes.func.isRequired
}
