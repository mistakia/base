import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import ImmutablePropTypes from 'react-immutable-proptypes'
import { Link } from 'react-router-dom'
import Task from '@components/Task'
import {
  TASK_STATUS,
  TASK_PRIORITY_ORDER
} from '#libs-shared/task-constants.mjs'

// Get primary tag URI from task (returns full URI or 'General')
const get_primary_tag_uri = (task) => {
  const tags = task.entity_properties?.tags
  if (!tags || !Array.isArray(tags) || tags.length === 0) {
    return 'General'
  }
  return tags[0]
}

// Extract name from base URI format (e.g., 'user:tag/league-xo-football.md' -> 'league-xo-football')
// Handles any path pattern (tag/, physical-location/, etc.)
const extract_tag_name = (tag_uri) => {
  if (tag_uri === 'General') return 'General'
  // Match the filename (without .md extension) from any path
  const match = tag_uri.match(/\/([^/]+)\.md$/)
  return match ? match[1] : 'General'
}

// Format tag name for display (e.g., 'league-xo-football' -> 'League Xo Football')
const format_tag_name = (tag_name) => {
  if (tag_name === 'General') return tag_name
  return tag_name
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// Get display name for a tag, redacting if not public
const get_tag_display_name = (tag_uri, tag_visibility) => {
  if (tag_uri === 'General') return 'General'

  // Check if tag is public (has public_read: true)
  const is_public = tag_visibility?.get?.(tag_uri) === true

  if (is_public) {
    const tag_name = extract_tag_name(tag_uri)
    return format_tag_name(tag_name)
  } else {
    // Return redacted text for non-public tags
    return '████████'
  }
}

const HomePageTasks = ({
  tasks,
  tag_visibility,
  is_loading_tasks,
  load_tasks
}) => {
  const [is_collapsed, set_is_collapsed] = useState(true)

  useEffect(() => {
    load_tasks()
  }, [load_tasks])

  const handle_toggle = () => {
    set_is_collapsed(!is_collapsed)
  }

  if (is_loading_tasks) {
    return (
      <div className='tasks-container'>
        <div
          className='home-section-header home-section-header--clickable'
          onClick={handle_toggle}
          role='button'
          tabIndex={0}
          aria-expanded={!is_collapsed}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              handle_toggle()
            }
          }}>
          <span className='home-section-header__toggle'>
            {is_collapsed ? '+' : '-'}
          </span>
          <span className='home-section-header__dot home-section-header__dot--tasks' />
          <span className='home-section-header__title'>Tasks</span>
        </div>
      </div>
    )
  }

  // Filter to ongoing tasks and sort by priority, then by updated_at
  const ongoing_tasks = tasks
    .filter(
      (task) =>
        task.entity_properties.status === TASK_STATUS.IN_PROGRESS ||
        task.entity_properties.status === TASK_STATUS.STARTED
    )
    .sort((a, b) => {
      const priority_a = TASK_PRIORITY_ORDER[a.entity_properties.priority] || 0
      const priority_b = TASK_PRIORITY_ORDER[b.entity_properties.priority] || 0
      if (priority_a !== priority_b) {
        return priority_b - priority_a
      }

      const updated_a = new Date(
        a.entity_properties.updated_at || a.entity_properties.created_at || 0
      )
      const updated_b = new Date(
        b.entity_properties.updated_at || b.entity_properties.created_at || 0
      )
      return updated_b - updated_a
    })

  // Group tasks by primary tag URI
  const tasks_by_tag = ongoing_tasks.reduce((groups, task) => {
    const tag_uri = get_primary_tag_uri(task)
    if (!groups[tag_uri]) {
      groups[tag_uri] = []
    }
    groups[tag_uri].push(task)
    return groups
  }, {})

  // Sort tag groups: named tags first (alphabetically), then General
  const sorted_tags = Object.keys(tasks_by_tag).sort((a, b) => {
    if (a === 'General') return 1
    if (b === 'General') return -1
    return a.localeCompare(b)
  })

  if (ongoing_tasks.size === 0) {
    return null
  }

  return (
    <div className='tasks-container'>
      <div
        className='home-section-header home-section-header--clickable'
        onClick={handle_toggle}
        role='button'
        tabIndex={0}
        aria-expanded={!is_collapsed}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            handle_toggle()
          }
        }}>
        <span className='home-section-header__toggle'>
          {is_collapsed ? '+' : '-'}
        </span>
        <span className='home-section-header__dot home-section-header__dot--tasks' />
        <span className='home-section-header__title'>Tasks</span>
        <Link
          to='/task'
          className='home-section-header__count'
          onClick={(e) => e.stopPropagation()}>
          {ongoing_tasks.size}
        </Link>
      </div>
      {!is_collapsed && (
        <div className='tasks-table'>
          <div className='tasks-table-header'>
            <div>Task</div>
            <div>Status</div>
            <div>Priority</div>
            <div>Finish By</div>
          </div>
          <div className='tasks-table-body'>
            {sorted_tags.map((tag_uri) => (
              <div key={tag_uri} className='task-group'>
                {sorted_tags.length > 1 && (
                  <div className='task-group-header'>
                    <span className='task-group-name'>
                      {get_tag_display_name(tag_uri, tag_visibility)}
                    </span>
                    <span className='task-group-count'>
                      ({tasks_by_tag[tag_uri].length})
                    </span>
                  </div>
                )}
                <div className='task-group-items'>
                  {tasks_by_tag[tag_uri].map((task) => (
                    <Task key={task.entity_properties.entity_id} task={task} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

HomePageTasks.propTypes = {
  tasks: ImmutablePropTypes.list.isRequired,
  tag_visibility: ImmutablePropTypes.map,
  is_loading_tasks: PropTypes.bool.isRequired,
  load_tasks: PropTypes.func.isRequired
}

export default HomePageTasks
