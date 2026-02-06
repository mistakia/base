import React from 'react'
import PropTypes from 'prop-types'
import { Link } from 'react-router-dom'
import { Close as CloseIcon } from '@mui/icons-material'

import { convert_base_uri_to_path } from '@views/utils/base-uri-constants.js'
import { format_relative_time } from '@views/utils/date-formatting.js'

/**
 * TagExpandedViews Component
 *
 * Full-screen expanded view for tasks or threads.
 * Shows complete list with navigation back to dashboard.
 *
 * @param {string} expanded_view - 'tasks' or 'threads'
 * @param {Array} tasks - Array of task entities
 * @param {Array} threads - Array of thread objects
 * @param {string} base_uri - Tag base_uri for navigation links
 * @param {function} on_close - Handler to close expanded view
 */
const TagExpandedViews = ({
  expanded_view,
  tasks,
  threads,
  base_uri,
  on_close
}) => {
  const is_tasks_view = expanded_view === 'tasks'
  const title = is_tasks_view ? 'All Tasks' : 'All Threads'

  const get_status_class = (status) => {
    const status_lower = (status || '').toLowerCase().replace(/\s+/g, '-')
    return `tag-expanded__status--${status_lower}`
  }

  const get_priority_class = (priority) => {
    const priority_lower = (priority || '').toLowerCase()
    return `tag-expanded__priority--${priority_lower}`
  }

  const get_state_class = (state) => {
    const state_lower = (state || 'unknown').toLowerCase()
    return `tag-expanded__state--${state_lower}`
  }

  return (
    <div className='tag-expanded'>
      <div className='tag-expanded__header'>
        <h2 className='tag-expanded__title'>{title}</h2>
        <button
          className='tag-expanded__close'
          onClick={on_close}
          type='button'
          aria-label='Close expanded view'
        >
          <CloseIcon fontSize='small' />
        </button>
      </div>

      <div className='tag-expanded__content'>
        {is_tasks_view ? (
          <ul className='tag-expanded__list'>
            {tasks.map((task) => {
              const task_path = convert_base_uri_to_path(task.base_uri)
              return (
                <li key={task.entity_id} className='tag-expanded__item'>
                  <Link to={task_path} className='tag-expanded__link'>
                    <div className='tag-expanded__item-main'>
                      <span className='tag-expanded__item-title'>
                        {task.title || 'Untitled'}
                      </span>
                      {task.description && (
                        <span className='tag-expanded__item-description'>
                          {task.description}
                        </span>
                      )}
                    </div>
                    <div className='tag-expanded__item-meta'>
                      <span
                        className={`tag-expanded__status ${get_status_class(task.status)}`}
                      >
                        {task.status || 'No status'}
                      </span>
                      {task.priority && task.priority !== 'None' && (
                        <span
                          className={`tag-expanded__priority ${get_priority_class(task.priority)}`}
                        >
                          {task.priority}
                        </span>
                      )}
                      {task.updated_at && (
                        <span className='tag-expanded__time'>
                          {format_relative_time(task.updated_at)}
                        </span>
                      )}
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : (
          <ul className='tag-expanded__list'>
            {threads.map((thread) => (
              <li key={thread.thread_id} className='tag-expanded__item'>
                <Link
                  to={`/thread/${thread.thread_id}`}
                  className='tag-expanded__link'
                >
                  <div className='tag-expanded__item-main'>
                    <span className='tag-expanded__item-title'>
                      {thread.title ||
                        thread.short_description ||
                        'Untitled Thread'}
                    </span>
                    {thread.working_directory && (
                      <span className='tag-expanded__item-description'>
                        {thread.working_directory}
                      </span>
                    )}
                  </div>
                  <div className='tag-expanded__item-meta'>
                    <span
                      className={`tag-expanded__state ${get_state_class(thread.thread_state)}`}
                    >
                      {thread.thread_state || 'unknown'}
                    </span>
                    {thread.message_count > 0 && (
                      <span className='tag-expanded__count'>
                        {thread.message_count} messages
                      </span>
                    )}
                    {thread.updated_at && (
                      <span className='tag-expanded__time'>
                        {format_relative_time(thread.updated_at)}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

TagExpandedViews.propTypes = {
  expanded_view: PropTypes.oneOf(['tasks', 'threads']).isRequired,
  tasks: PropTypes.array.isRequired,
  threads: PropTypes.array.isRequired,
  base_uri: PropTypes.string.isRequired,
  on_close: PropTypes.func.isRequired
}

export default TagExpandedViews
