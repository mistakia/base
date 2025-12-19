import React, { useEffect } from 'react'
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

  useEffect(() => {
    dispatch(active_sessions_actions.load_active_sessions())
  }, [dispatch])

  useEffect(() => {
    if (load_threads) {
      load_threads()
    }
  }, [load_threads])

  // Filter threads that are active (need attention)
  const active_threads = threads
    ? threads.filter((thread) => thread.thread_state === 'active')
    : []

  const displayed_threads = List.isList(active_threads)
    ? active_threads.take(max_threads)
    : active_threads.slice(0, max_threads)

  const has_active_sessions = active_session_count > 0
  const has_active_threads =
    active_threads.size > 0 || active_threads.length > 0
  const active_thread_count = active_threads.size || active_threads.length

  // Don't render if nothing to show
  if (!has_active_sessions && !has_active_threads) {
    return null
  }

  const sessions_list = active_sessions || []

  const threads_list = displayed_threads.toJS
    ? displayed_threads.toJS()
    : displayed_threads

  const handle_session_click = (session) => {
    if (session.thread_id) {
      navigate(`/thread/${session.thread_id}`)
    }
  }

  const handle_thread_click = (thread) => {
    navigate(`/thread/${thread.thread_id}`)
  }

  const format_directory = (path) => {
    if (!path) return 'Unknown'
    return path.split('/').pop() || 'root'
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
          <div className='sessions-panel__items'>
            {sessions_list.map((session) => {
              const is_idle = session.status === 'idle'
              const has_thread = Boolean(session.thread_id)
              return (
                <div
                  key={session.session_id}
                  className={`sessions-panel__chip sessions-panel__chip--session ${is_idle ? 'sessions-panel__chip--idle' : ''} ${has_thread ? 'sessions-panel__chip--clickable' : ''}`}
                  onClick={
                    has_thread ? () => handle_session_click(session) : undefined
                  }
                  title={
                    has_thread
                      ? 'Click to view thread'
                      : `Session: ${session.session_id}`
                  }>
                  <span
                    className={`sessions-panel__chip-dot ${is_idle ? 'sessions-panel__chip-dot--idle' : ''}`}
                  />
                  <span className='sessions-panel__chip-text'>
                    {format_directory(session.working_directory)}
                  </span>
                </div>
              )
            })}
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
          <div className='sessions-panel__items'>
            {threads_list.map((thread) => (
              <div
                key={thread.thread_id}
                className='sessions-panel__chip sessions-panel__chip--thread sessions-panel__chip--clickable'
                onClick={() => handle_thread_click(thread)}
                title={thread.title || 'View thread'}>
                <span className='sessions-panel__chip-text'>
                  {thread.title ||
                    format_directory(
                      thread.external_session?.provider_metadata
                        ?.working_directory
                    )}
                </span>
              </div>
            ))}
            {active_thread_count > max_threads && (
              <Link
                to='/thread'
                className='sessions-panel__chip sessions-panel__chip--more'>
                +{active_thread_count - max_threads} more
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
