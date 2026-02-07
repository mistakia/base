import React from 'react'
import PropTypes from 'prop-types'
import { Link } from 'react-router-dom'
import { OpenInNew as OpenInNewIcon } from '@mui/icons-material'

import { format_relative_time } from '@views/utils/date-formatting.js'

/**
 * TagThreadsPanel Component
 *
 * Displays a compact list of threads tagged with the current tag.
 * Shows recent threads with state indicators and links to full list.
 *
 * @param {Array} threads - Array of thread objects
 * @param {number} thread_count - Total count of threads
 * @param {string} base_uri - Tag base_uri for "View All" link
 * @param {function} on_expand - Handler for expand button
 */
const TagThreadsPanel = ({ threads, thread_count, base_uri, on_expand }) => {
  const visible_threads = threads.slice(0, 5)
  const has_more = thread_count > 5

  const get_state_class = (state) => {
    const state_lower = (state || 'unknown').toLowerCase()
    return `tag-threads-panel__state--${state_lower}`
  }

  // Build URL for viewing all threads with this tag
  const view_all_url = `/thread?tag=${encodeURIComponent(base_uri)}`

  return (
    <div className='tag-threads-panel'>
      <div className='tag-threads-panel__header'>
        <h3 className='tag-threads-panel__title'>Threads</h3>
        <span className='tag-threads-panel__count'>{thread_count}</span>
      </div>

      {visible_threads.length === 0 ? (
        <div className='tag-threads-panel__empty'>No threads with this tag</div>
      ) : (
        <ul className='tag-threads-panel__list'>
          {visible_threads.map((thread) => (
            <li key={thread.thread_id} className='tag-threads-panel__item'>
              <Link
                to={`/thread/${thread.thread_id}`}
                className='tag-threads-panel__link'>
                <span className='tag-threads-panel__thread-title'>
                  {thread.title ||
                    thread.short_description ||
                    'Untitled Thread'}
                </span>
                <span
                  className={`tag-threads-panel__state ${get_state_class(thread.thread_state)}`}>
                  {thread.thread_state || 'unknown'}
                </span>
                {thread.updated_at && (
                  <span className='tag-threads-panel__time'>
                    {format_relative_time(thread.updated_at)}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {has_more && (
        <div className='tag-threads-panel__footer'>
          <Link to={view_all_url} className='tag-threads-panel__view-all'>
            View all {thread_count} threads
            <OpenInNewIcon fontSize='inherit' />
          </Link>
        </div>
      )}
    </div>
  )
}

TagThreadsPanel.propTypes = {
  threads: PropTypes.arrayOf(
    PropTypes.shape({
      thread_id: PropTypes.string.isRequired,
      title: PropTypes.string,
      short_description: PropTypes.string,
      thread_state: PropTypes.string,
      updated_at: PropTypes.string
    })
  ).isRequired,
  thread_count: PropTypes.number.isRequired,
  base_uri: PropTypes.string.isRequired,
  on_expand: PropTypes.func
}

export default TagThreadsPanel
