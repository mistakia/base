import React from 'react'
import PropTypes from 'prop-types'
import { Link } from 'react-router-dom'
import { OpenInNew as OpenInNewIcon } from '@mui/icons-material'

import { convert_base_uri_to_path } from '@views/utils/base-uri-constants.js'
import { build_data_view_url } from '@core/utils/view-url-utils.js'

/**
 * TagTasksPanel Component
 *
 * Displays a compact list of tasks tagged with the current tag.
 * Shows recent tasks with status indicators and links to full list.
 *
 * @param {Array} tasks - Array of task entities
 * @param {number} task_count - Total count of tasks
 * @param {string} base_uri - Tag base_uri for "View All" link
 * @param {function} on_expand - Handler for expand button
 */
const TagTasksPanel = ({ tasks, task_count, base_uri, on_expand }) => {
  const visible_tasks = tasks.slice(0, 15)
  const has_more = task_count > 15

  const get_status_class = (status) => {
    const status_lower = (status || '').toLowerCase().replace(/\s+/g, '-')
    return `tag-tasks-panel__status--${status_lower}`
  }

  const get_priority_class = (priority) => {
    const priority_lower = (priority || '').toLowerCase()
    return `tag-tasks-panel__priority--${priority_lower}`
  }

  // Build URL for viewing all tasks with this tag
  const view_all_url = build_data_view_url({
    base_path: '/task',
    tag: base_uri
  })

  return (
    <div className='tag-tasks-panel'>
      <div className='tag-tasks-panel__header'>
        <h3 className='tag-tasks-panel__title'>Tasks</h3>
        <span className='tag-tasks-panel__count'>{task_count}</span>
      </div>

      {visible_tasks.length === 0 ? (
        <div className='tag-tasks-panel__empty'>No tasks with this tag</div>
      ) : (
        <ul className='tag-tasks-panel__list'>
          {visible_tasks.map((task) => {
            const task_path = convert_base_uri_to_path(task.base_uri)
            return (
              <li key={task.entity_id} className='tag-tasks-panel__item'>
                <Link to={task_path} className='tag-tasks-panel__link'>
                  <span className='tag-tasks-panel__task-title'>
                    {task.title || 'Untitled'}
                  </span>
                  <span
                    className={`tag-tasks-panel__status ${get_status_class(task.status)}`}>
                    {task.status || 'No status'}
                  </span>
                  {task.priority && task.priority !== 'None' && (
                    <span
                      className={`tag-tasks-panel__priority ${get_priority_class(task.priority)}`}>
                      {task.priority}
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {has_more && (
        <div className='tag-tasks-panel__footer'>
          <Link to={view_all_url} className='tag-tasks-panel__view-all'>
            View all {task_count} tasks
            <OpenInNewIcon fontSize='inherit' />
          </Link>
        </div>
      )}
    </div>
  )
}

TagTasksPanel.propTypes = {
  tasks: PropTypes.arrayOf(
    PropTypes.shape({
      entity_id: PropTypes.string.isRequired,
      base_uri: PropTypes.string.isRequired,
      title: PropTypes.string,
      status: PropTypes.string,
      priority: PropTypes.string
    })
  ).isRequired,
  task_count: PropTypes.number.isRequired,
  base_uri: PropTypes.string.isRequired,
  on_expand: PropTypes.func
}

export default TagTasksPanel
