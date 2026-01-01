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

// Get primary tag URI from task (returns full URI or 'General')
const get_primary_tag_uri = (task) => {
  const tags = task.entity_properties?.tags
  if (!tags || !Array.isArray(tags) || tags.length === 0) {
    return 'General'
  }
  return tags[0]
}

// Extract tag name from base URI format (e.g., 'user:tag/league-xo-football.md' -> 'league-xo-football')
const extract_tag_name = (tag_uri) => {
  if (tag_uri === 'General') return 'General'
  const match = tag_uri.match(/tag\/([^.]+)\.md$/)
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
      const priority_a = TASK_PRIORITY_ORDER[a.entity_properties.priority] || 0
      const priority_b = TASK_PRIORITY_ORDER[b.entity_properties.priority] || 0
      if (priority_a !== priority_b) {
        return priority_b - priority_a
      }

      // Then sort by updated_at (most recent first)
      const updated_a = new Date(
        a.entity_properties.updated_at || a.entity_properties.created_at || 0
      )
      const updated_b = new Date(
        b.entity_properties.updated_at || b.entity_properties.created_at || 0
      )
      return updated_b - updated_a
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

  // Group tasks by primary tag URI
  const tasks_by_tag = displayed_tasks.reduce((groups, task) => {
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
          {sorted_tags.map((tag_uri, index) => (
            <div
              key={tag_uri}
              className={`task-group ${index % 2 === 0 ? 'task-group-even' : 'task-group-odd'}`}>
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
  tag_visibility: ImmutablePropTypes.map,
  is_loading_tasks: PropTypes.bool.isRequired,
  load_tasks: PropTypes.func.isRequired
}

export default HomePageTasks
