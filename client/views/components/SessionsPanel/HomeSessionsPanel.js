import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import ImmutablePropTypes from 'react-immutable-proptypes'
import { useSelector, useDispatch } from 'react-redux'
import { Link } from 'react-router-dom'
import { List } from 'immutable'

import { active_sessions_actions } from '@core/active-sessions/actions'
import {
  get_all_active_sessions,
  get_active_sessions_count
} from '@core/active-sessions/selectors'
import Thread from '@components/Thread/index.js'
import ActiveSessionCard from './ActiveSessionCard.js'
import './HomeSessionsPanel.styl'

const HomeSessionsPanel = ({
  threads,
  is_loading_threads,
  load_threads,
  max_threads = 3
}) => {
  const dispatch = useDispatch()
  const active_sessions = useSelector(get_all_active_sessions)
  const active_session_count = useSelector(get_active_sessions_count)
  const [sessions_collapsed, set_sessions_collapsed] = useState(true)
  const [threads_collapsed, set_threads_collapsed] = useState(true)

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

  // Don't render if nothing to show
  if (!has_active_sessions && !has_active_threads) {
    return null
  }

  const sessions_list = active_sessions || []

  const threads_list = displayed_threads.toJS
    ? displayed_threads.toJS()
    : displayed_threads

  return (
    <div className='home-sessions-panel'>
      {has_active_sessions && (
        <div className='home-sessions-panel__section'>
          <div
            className='home-sessions-panel__header home-sessions-panel__header--clickable'
            onClick={() => set_sessions_collapsed(!sessions_collapsed)}
            role='button'
            tabIndex={0}
            aria-expanded={!sessions_collapsed}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                set_sessions_collapsed(!sessions_collapsed)
              }
            }}>
            <span className='home-sessions-panel__toggle'>
              {sessions_collapsed ? '+' : '-'}
            </span>
            <span className='home-sessions-panel__header-dot home-sessions-panel__header-dot--active' />
            <span className='home-sessions-panel__header-title'>
              Active Sessions
            </span>
            <span className='home-sessions-panel__header-count'>
              {active_session_count}
            </span>
          </div>
          {!sessions_collapsed && (
            <div className='home-sessions-panel__list'>
              {sessions_list.map((session) => (
                <ActiveSessionCard key={session.session_id} session={session} />
              ))}
            </div>
          )}
        </div>
      )}

      {has_active_threads && (
        <div className='home-sessions-panel__section'>
          <div className='home-sessions-panel__header'>
            <span
              className='home-sessions-panel__header-label home-sessions-panel__header-label--clickable'
              onClick={() => set_threads_collapsed(!threads_collapsed)}
              role='button'
              tabIndex={0}
              aria-expanded={!threads_collapsed}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  set_threads_collapsed(!threads_collapsed)
                }
              }}>
              <span className='home-sessions-panel__toggle'>
                {threads_collapsed ? '+' : '-'}
              </span>
              <span className='home-sessions-panel__header-dot home-sessions-panel__header-dot--review' />
              <span className='home-sessions-panel__header-title'>
                Ready for Review
              </span>
            </span>
            <Link to='/thread' className='home-sessions-panel__header-count'>
              {active_threads.size || active_threads.length}
            </Link>
          </div>
          {!threads_collapsed && (
            <div className='home-sessions-panel__list'>
              {threads_list.map((thread) => (
                <Thread key={thread.thread_id} thread={thread} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

HomeSessionsPanel.propTypes = {
  threads: ImmutablePropTypes.list,
  is_loading_threads: PropTypes.bool,
  load_threads: PropTypes.func,
  max_threads: PropTypes.number
}

export default HomeSessionsPanel
