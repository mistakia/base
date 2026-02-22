import React from 'react'
import PropTypes from 'prop-types'
import { Link } from 'react-router-dom'
import { Close as CloseIcon } from '@mui/icons-material'

import { convert_base_uri_to_path } from '@views/utils/base-uri-constants.js'
import { format_relative_time } from '@views/utils/date-formatting.js'
import { to_snake_slug } from '@core/utils'
import {
  get_entity_type_color,
  get_entity_type_display_label
} from '#libs-shared/entity-constants.mjs'

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
  entities_by_type = {},
  entity_types = [],
  base_uri,
  on_close
}) => {
  const title_map = {
    tasks: 'All Tasks',
    threads: 'All Threads',
    entities: 'All Entities'
  }
  const title = title_map[expanded_view] || 'All Items'

  const get_status_slug = (status) => to_snake_slug(status) || 'no_status'
  const get_priority_slug = (priority) => to_snake_slug(priority) || 'none'

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
          aria-label='Close expanded view'>
          <CloseIcon fontSize='small' />
        </button>
      </div>

      <div className='tag-expanded__content'>
        {expanded_view === 'tasks' && (
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
                        className='tag-expanded__status'
                        data-status={get_status_slug(task.status)}>
                        {task.status || 'No status'}
                      </span>
                      {task.priority && task.priority !== 'None' && (
                        <span
                          className='tag-expanded__priority'
                          data-priority={get_priority_slug(task.priority)}>
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
        )}

        {expanded_view === 'threads' && (
          <ul className='tag-expanded__list'>
            {threads.map((thread) => (
              <li key={thread.thread_id} className='tag-expanded__item'>
                <Link
                  to={`/thread/${thread.thread_id}`}
                  className='tag-expanded__link'>
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
                      className={`tag-expanded__state ${get_state_class(thread.thread_state)}`}>
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

        {expanded_view === 'entities' && (
          <div className='tag-expanded__entity-groups'>
            {entity_types.map((type) => {
              const type_color = get_entity_type_color(type)
              const type_label = get_entity_type_display_label(type)
              const type_entities = entities_by_type[type] || []

              return (
                <div key={type} className='tag-expanded__type-group'>
                  <h3 className='tag-expanded__type-heading'>
                    <span
                      className='tag-expanded__type-label'
                      style={{
                        color: type_color,
                        background: `${type_color}26`
                      }}>
                      {type_label}
                    </span>
                    <span className='tag-expanded__type-count'>
                      {type_entities.length}
                    </span>
                  </h3>
                  <ul className='tag-expanded__list'>
                    {type_entities.map((entity) => {
                      const entity_path = convert_base_uri_to_path(
                        entity.base_uri
                      )
                      return (
                        <li
                          key={entity.entity_id}
                          className='tag-expanded__item'>
                          <Link to={entity_path} className='tag-expanded__link'>
                            <div className='tag-expanded__item-main'>
                              <span className='tag-expanded__item-title'>
                                {entity.title || 'Untitled'}
                              </span>
                              {entity.description && (
                                <span className='tag-expanded__item-description'>
                                  {entity.description}
                                </span>
                              )}
                            </div>
                            <div className='tag-expanded__item-meta'>
                              <span
                                className='tag-expanded__type-label'
                                style={{
                                  color: type_color,
                                  background: `${type_color}26`
                                }}>
                                {type_label}
                              </span>
                              {entity.updated_at && (
                                <span className='tag-expanded__time'>
                                  {format_relative_time(entity.updated_at)}
                                </span>
                              )}
                            </div>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

TagExpandedViews.propTypes = {
  expanded_view: PropTypes.oneOf(['tasks', 'threads', 'entities']).isRequired,
  tasks: PropTypes.array.isRequired,
  threads: PropTypes.array.isRequired,
  entities_by_type: PropTypes.object,
  entity_types: PropTypes.arrayOf(PropTypes.string),
  base_uri: PropTypes.string.isRequired,
  on_close: PropTypes.func.isRequired
}

export default TagExpandedViews
