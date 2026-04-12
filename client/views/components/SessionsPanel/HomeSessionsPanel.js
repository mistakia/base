import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import ImmutablePropTypes from 'react-immutable-proptypes'
import { useSelector, useDispatch } from 'react-redux'
import { Link } from 'react-router-dom'
import { List } from 'immutable'

import { active_sessions_actions } from '@core/active-sessions/actions'
import {
  get_active_sessions_count
} from '@core/active-sessions/selectors'
import { get_can_create_threads, get_app } from '@core/app/selectors.js'
import SessionCard from './SessionCard.js'
import normalize_thread from './normalize-thread.js'
import './HomeSessionsPanel.styl'

// Constants for display logic
const MIN_THREADS_TO_SHOW = 5

// Time period options in hours
const TIME_PERIODS = {
  '3d': { label: '3d', hours: 72 },
  '1w': { label: '1w', hours: 168 },
  '1m': { label: '1m', hours: 720 }
}

const HomeSessionsPanel = ({ threads, session_created_at, load_threads }) => {
  const dispatch = useDispatch()
  const active_session_count = useSelector(get_active_sessions_count)
  const can_create_threads = useSelector(get_can_create_threads)
  const app = useSelector(get_app)
  const user_public_key = app.get('user_public_key')
  const [collapsed, set_collapsed] = useState(true)
  const [selected_period, set_selected_period] = useState('3d')

  // Auto-expand when a new session is created
  useEffect(() => {
    if (session_created_at) {
      set_collapsed(false)
    }
  }, [session_created_at])

  useEffect(() => {
    dispatch(active_sessions_actions.load_active_sessions())
  }, [dispatch])

  useEffect(() => {
    if (load_threads) {
      const params = { thread_state: 'active' }
      if (can_create_threads && user_public_key) {
        params.user_public_key = user_public_key
      }
      load_threads(params)
    }
  }, [load_threads, can_create_threads, user_public_key])

  // Filter to active threads owned by the current user
  const all_active_threads = threads
    ? (List.isList(threads) ? threads.toJS() : threads).filter(
        (thread) => thread.thread_state === 'active'
      )
    : []

  // Calculate threads to display based on time period
  const now = Date.now()
  const recent_hours = TIME_PERIODS[selected_period].hours
  const recent_cutoff = now - recent_hours * 60 * 60 * 1000

  const recent_threads = all_active_threads.filter((thread) => {
    const created_at = new Date(thread.created_at).getTime()
    return created_at >= recent_cutoff
  })

  // Show all recent threads, or at least MIN_THREADS_TO_SHOW
  const threads_to_display =
    recent_threads.length >= MIN_THREADS_TO_SHOW
      ? recent_threads
      : all_active_threads.slice(
          0,
          Math.min(MIN_THREADS_TO_SHOW, all_active_threads.length)
        )

  // Sort by created_at descending (immutable ordering)
  const displayed_threads = [...threads_to_display].sort((a, b) => {
    const a_created = new Date(a.created_at).getTime()
    const b_created = new Date(b.created_at).getTime()
    return b_created - a_created
  })

  const total_count = all_active_threads.length

  if (total_count === 0) {
    return null
  }

  return (
    <div className='home-sessions-panel'>
      <div className='home-sessions-panel__section'>
        <div className='home-section-header home-section-header--with-controls'>
          <div
            className='home-section-header__left home-section-header--clickable'
            onClick={() => set_collapsed(!collapsed)}
            role='button'
            tabIndex={0}
            aria-expanded={!collapsed}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                set_collapsed(!collapsed)
              }
            }}>
            <span className='home-section-header__toggle'>
              {collapsed ? '+' : '-'}
            </span>
            {active_session_count > 0 && (
              <span className='home-section-header__dot home-section-header__dot--active' />
            )}
            <span className='home-section-header__title'>Threads</span>
            <Link
              to='/thread'
              className='home-section-header__count'
              onClick={(e) => e.stopPropagation()}>
              {total_count}
            </Link>
          </div>
          {!collapsed && (
            <div
              className='time-period-toggle'
              onClick={(e) => e.stopPropagation()}>
              {Object.entries(TIME_PERIODS).map(([key, { label }]) => (
                <button
                  key={key}
                  className={`time-period-toggle__button ${selected_period === key ? 'time-period-toggle__button--active' : ''}`}
                  onClick={() => set_selected_period(key)}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        {!collapsed && (
          <div className='home-sessions-panel__list'>
            {displayed_threads.map((thread) => (
              <SessionCard
                key={thread.thread_id}
                item={normalize_thread(thread)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

HomeSessionsPanel.propTypes = {
  threads: ImmutablePropTypes.list,
  session_created_at: PropTypes.number,
  load_threads: PropTypes.func
}

export default HomeSessionsPanel
