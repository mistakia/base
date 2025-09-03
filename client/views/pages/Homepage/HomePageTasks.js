import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import ImmutablePropTypes from 'react-immutable-proptypes'
import { Link } from 'react-router-dom'
import Task from '@components/Task'
import {
  TASK_STATUS,
  TASK_PRIORITY_ORDER,
  TASK_PRIORITY
} from '#libs-shared/task-constants.mjs'

const HomePageTasks = ({ tasks, is_loading_tasks, load_tasks }) => {
  const [is_expanded, setIsExpanded] = useState(false)

  useEffect(() => {
    load_tasks()
  }, [load_tasks])

  if (is_loading_tasks) {
    return (
      <div className='tasks-container loading-home-tasks'>
        <div>Loading tasks...</div>
      </div>
    )
  }

  const ongoing_tasks = tasks
    .filter(
      (task) =>
        task.entity_properties.status === TASK_STATUS.IN_PROGRESS ||
        task.entity_properties.status === TASK_STATUS.STARTED
    )
    .sort((a, b) => {
      // First sort by priority (higher priority first)
      const priorityA = TASK_PRIORITY_ORDER[a.entity_properties.priority] || 0
      const priorityB = TASK_PRIORITY_ORDER[b.entity_properties.priority] || 0
      if (priorityA !== priorityB) {
        return priorityB - priorityA
      }

      // Then sort by updated_at (most recent first)
      const updatedA = new Date(a.updated_at || a.created_at || 0)
      const updatedB = new Date(b.updated_at || b.created_at || 0)
      return updatedB - updatedA
    })

  // Filter tasks based on expansion state
  const high_priority_tasks = ongoing_tasks.filter(
    (task) =>
      task.entity_properties.priority === TASK_PRIORITY.CRITICAL ||
      task.entity_properties.priority === TASK_PRIORITY.HIGH
  )

  const lower_priority_tasks = ongoing_tasks.filter(
    (task) =>
      task.entity_properties.priority !== TASK_PRIORITY.CRITICAL &&
      task.entity_properties.priority !== TASK_PRIORITY.HIGH
  )

  const displayed_tasks = is_expanded ? ongoing_tasks : high_priority_tasks
  const hidden_tasks_count = lower_priority_tasks.size

  if (ongoing_tasks.size === 0) {
    return null
  }

  return (
    <div className='tasks-container'>
      <div className='tasks-table'>
        <div className='tasks-table-header'>
          <div className='task-header-with-link'>
            <span>Task</span>
            <Link to='/task' className='view-all-link'>
              view all
            </Link>
          </div>
          <div>Status</div>
          <div>Priority</div>
          <div>Finish By</div>
        </div>
        <div className='tasks-table-body'>
          {displayed_tasks.map((task) => (
            <Task key={task.entity_properties.entity_id} task={task} />
          ))}
        </div>
        {hidden_tasks_count > 0 && (
          <div className='tasks-toggle-container'>
            <button
              className='tasks-toggle-button'
              onClick={() => setIsExpanded(!is_expanded)}>
              {is_expanded
                ? 'show less'
                : `show ${hidden_tasks_count} more task${hidden_tasks_count === 1 ? '' : 's'}`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

HomePageTasks.propTypes = {
  tasks: ImmutablePropTypes.list.isRequired,
  is_loading_tasks: PropTypes.bool.isRequired,
  load_tasks: PropTypes.func.isRequired
}

export default HomePageTasks
