import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { useSelector } from 'react-redux'

import { api_request, api } from '@core/api/service'
import { get_user_token } from '@core/app/selectors'
import TagTasksPanel from './TagTasksPanel.js'
import TagThreadsPanel from './TagThreadsPanel.js'
import TagExpandedViews from './TagExpandedViews.js'

import '@styles/pages/tag-dashboard.styl'

/**
 * TagDashboard Component
 *
 * Container component for tag detail views. Fetches tag data including
 * related entities, threads, and counts, then renders the dashboard panels.
 *
 * @param {Object} frontmatter - Tag entity frontmatter with base_uri
 */
const TagDashboard = ({ frontmatter }) => {
  const auth_token = useSelector(get_user_token)
  const [tag_data, set_tag_data] = useState(null)
  const [is_loading, set_is_loading] = useState(true)
  const [error, set_error] = useState(null)
  const [expanded_view, set_expanded_view] = useState(null)

  const base_uri = frontmatter?.base_uri

  useEffect(() => {
    if (!base_uri) {
      set_is_loading(false)
      return
    }

    let is_cancelled = false

    const fetch_tag_data = async () => {
      set_is_loading(true)
      set_error(null)

      try {
        const { request } = api_request(
          api.get_tag_detail,
          {
            base_uri,
            include_threads: true,
            sort: 'updated_at',
            limit: 50
          },
          auth_token
        )

        const data = await request()

        if (!is_cancelled) {
          set_tag_data(data)
        }
      } catch (err) {
        if (!is_cancelled) {
          set_error(err.message || 'Failed to load tag data')
        }
      } finally {
        if (!is_cancelled) {
          set_is_loading(false)
        }
      }
    }

    fetch_tag_data()

    return () => {
      is_cancelled = true
    }
  }, [base_uri, auth_token])

  const handle_expand_tasks = () => {
    set_expanded_view(expanded_view === 'tasks' ? null : 'tasks')
  }

  const handle_expand_threads = () => {
    set_expanded_view(expanded_view === 'threads' ? null : 'threads')
  }

  if (is_loading) {
    return (
      <div className='tag-dashboard tag-dashboard--loading'>
        <div className='tag-dashboard__loading-text'>Loading tag data...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className='tag-dashboard tag-dashboard--error'>
        <div className='tag-dashboard__error-text'>{error}</div>
      </div>
    )
  }

  if (!tag_data) {
    return null
  }

  const {
    entities = [],
    threads = [],
    task_count = 0,
    completed_task_count = 0,
    thread_count = 0
  } = tag_data

  // Filter entities to get only open tasks for the preview (match "open" view behavior)
  const closed_statuses = ['Completed', 'Abandoned']
  const tasks = entities.filter(
    (entity) =>
      entity.type === 'task' && !closed_statuses.includes(entity.status)
  )

  // If expanded view is active, show only that view
  if (expanded_view) {
    return (
      <TagExpandedViews
        expanded_view={expanded_view}
        tasks={tasks}
        threads={threads}
        base_uri={base_uri}
        on_close={() => set_expanded_view(null)}
      />
    )
  }

  return (
    <div className='tag-dashboard'>
      <div className='tag-dashboard__header'>
        <div className='tag-dashboard__counts'>
          <span className='tag-dashboard__count'>
            {task_count} task{task_count !== 1 ? 's' : ''}
          </span>
          {completed_task_count > 0 && (
            <>
              <span className='tag-dashboard__count-separator'>|</span>
              <span className='tag-dashboard__count tag-dashboard__count--completed'>
                {completed_task_count} completed
              </span>
            </>
          )}
          <span className='tag-dashboard__count-separator'>|</span>
          <span className='tag-dashboard__count'>
            {thread_count} thread{thread_count !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <div className='tag-dashboard__panels'>
        <TagTasksPanel
          tasks={tasks}
          task_count={task_count}
          base_uri={base_uri}
          on_expand={handle_expand_tasks}
        />
        <TagThreadsPanel
          threads={threads}
          thread_count={thread_count}
          base_uri={base_uri}
          on_expand={handle_expand_threads}
        />
      </div>
    </div>
  )
}

TagDashboard.propTypes = {
  frontmatter: PropTypes.shape({
    base_uri: PropTypes.string.isRequired,
    title: PropTypes.string,
    description: PropTypes.string
  }).isRequired
}

export default TagDashboard
