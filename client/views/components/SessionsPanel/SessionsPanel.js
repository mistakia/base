import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import ImmutablePropTypes from 'react-immutable-proptypes'
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate, Link } from 'react-router-dom'
import { List } from 'immutable'

import { active_sessions_actions } from '@core/active-sessions/actions'
import {
  get_all_active_sessions,
  get_active_sessions_count
} from '@core/active-sessions/selectors'
import './SessionsPanel.styl'

// Maximum items to show before "+N more" (approximate items that fit in rows)
const MAX_ACTIVE_ITEMS_COLLAPSED = 6 // ~2 rows
const MAX_REVIEW_ITEMS = 3 // ~1 row

const SessionsPanel = ({
  threads,
  is_loading_threads,
  load_threads,
  max_threads = 3
}) => {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const active_sessions = useSelector(get_all_active_sessions)
  const active_session_count = useSelector(get_active_sessions_count)

  // Expansion state for active section only (review uses link instead)
  const [active_expanded, set_active_expanded] = useState(false)

  useEffect(() => {
    dispatch(active_sessions_actions.load_active_sessions())
  }, [dispatch])

  useEffect(() => {
    if (load_threads) {
      load_threads()
    }
  }, [load_threads])

  // Get thread IDs that have active sessions
  const active_session_thread_ids = new Set(
    (active_sessions || [])
      .filter((session) => session.thread_id)
      .map((session) => session.thread_id)
  )

  // Filter threads that are active (need attention) and don't have an active session
  const active_threads = threads
    ? threads.filter(
        (thread) =>
          thread.thread_state === 'active' &&
          !active_session_thread_ids.has(thread.thread_id)
      )
    : []

  const has_active_sessions = active_session_count > 0
  const has_active_threads =
    active_threads.size > 0 || active_threads.length > 0
  const active_thread_count = active_threads.size || active_threads.length

  // Don't render if nothing to show
  if (!has_active_sessions && !has_active_threads) {
    return null
  }

  const sessions_list = active_sessions || []
  const threads_list = List.isList(active_threads)
    ? active_threads.toJS()
    : Array.isArray(active_threads)
      ? active_threads
      : []

  // Calculate which items to display
  const active_sessions_to_show = active_expanded
    ? sessions_list
    : sessions_list.slice(0, MAX_ACTIVE_ITEMS_COLLAPSED)
  const active_overflow_count =
    sessions_list.length - MAX_ACTIVE_ITEMS_COLLAPSED

  const threads_to_show = threads_list.slice(0, MAX_REVIEW_ITEMS)
  const review_overflow_count = threads_list.length - MAX_REVIEW_ITEMS

  const handle_session_click = (event, session) => {
    if (!session.thread_id) return

    // Cmd+click (Mac) or Ctrl+click (Windows/Linux) opens in new tab
    if (event.metaKey || event.ctrlKey) {
      window.open(`/thread/${session.thread_id}`, '_blank')
    } else {
      navigate(`/thread/${session.thread_id}`)
    }
  }

  const handle_thread_click = (event, thread) => {
    // Cmd+click (Mac) or Ctrl+click (Windows/Linux) opens in new tab
    if (event.metaKey || event.ctrlKey) {
      window.open(`/thread/${thread.thread_id}`, '_blank')
    } else {
      navigate(`/thread/${thread.thread_id}`)
    }
  }

  const format_directory = (path) => {
    if (!path) return 'Unknown'
    return path.split('/').pop() || 'root'
  }

  const handle_active_expand_toggle = () => {
    set_active_expanded(!active_expanded)
  }

  return (
    <div className='sessions-panel'>
      {/* Active Sessions Section */}
      {has_active_sessions && (
        <div className='sessions-panel__section sessions-panel__section--active'>
          <div className='sessions-panel__label'>
            <span className='sessions-panel__dot sessions-panel__dot--active' />
            <span className='sessions-panel__label-text'>Active</span>
            <span className='sessions-panel__count'>
              {active_session_count}
            </span>
          </div>
          <div className='sessions-panel__items sessions-panel__items--active'>
            {active_sessions_to_show.map((session) => {
              const is_idle = session.status === 'idle'
              const has_thread = Boolean(session.thread_id)
              // Use thread title if available, otherwise fall back to directory
              const display_text =
                session.thread_title ||
                format_directory(session.working_directory)
              return (
                <div
                  key={session.session_id}
                  className={`sessions-panel__chip sessions-panel__chip--session ${is_idle ? 'sessions-panel__chip--idle' : ''} ${has_thread ? 'sessions-panel__chip--clickable' : ''}`}
                  onClick={
                    has_thread
                      ? (event) => handle_session_click(event, session)
                      : undefined
                  }
                  title={display_text}>
                  <span
                    className={`sessions-panel__chip-dot ${is_idle ? 'sessions-panel__chip-dot--idle' : ''}`}
                  />
                  <span className='sessions-panel__chip-text'>
                    {display_text}
                  </span>
                </div>
              )
            })}
            {!active_expanded && active_overflow_count > 0 && (
              <button
                type='button'
                className='sessions-panel__chip sessions-panel__chip--more'
                onClick={handle_active_expand_toggle}>
                +{active_overflow_count} more
              </button>
            )}
            {active_expanded && active_overflow_count > 0 && (
              <button
                type='button'
                className='sessions-panel__chip sessions-panel__chip--more'
                onClick={handle_active_expand_toggle}>
                show less
              </button>
            )}
          </div>
        </div>
      )}

      {/* Ready for Review Section */}
      {has_active_threads && (
        <div className='sessions-panel__section sessions-panel__section--review'>
          <div className='sessions-panel__label'>
            <span className='sessions-panel__dot sessions-panel__dot--review' />
            <span className='sessions-panel__label-text'>Review</span>
            <span className='sessions-panel__count'>{active_thread_count}</span>
          </div>
          <div className='sessions-panel__items sessions-panel__items--review'>
            {threads_to_show.map((thread) => {
              const display_text =
                thread.title ||
                format_directory(
                  thread.source?.provider_metadata?.working_directory
                )
              return (
                <div
                  key={thread.thread_id}
                  className='sessions-panel__chip sessions-panel__chip--thread sessions-panel__chip--clickable'
                  onClick={(event) => handle_thread_click(event, thread)}
                  title={display_text}>
                  <span className='sessions-panel__chip-text'>
                    {display_text}
                  </span>
                </div>
              )
            })}
            {review_overflow_count > 0 && (
              <Link
                to='/thread?state=active'
                className='sessions-panel__chip sessions-panel__chip--more'>
                +{review_overflow_count} more
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

SessionsPanel.propTypes = {
  threads: ImmutablePropTypes.list,
  is_loading_threads: PropTypes.bool,
  load_threads: PropTypes.func,
  max_threads: PropTypes.number
}

export default SessionsPanel
