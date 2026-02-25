import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import ImmutablePropTypes from 'react-immutable-proptypes'
import { useSelector, useDispatch } from 'react-redux'
import { Link } from 'react-router-dom'
import { List } from 'immutable'

import { active_sessions_actions } from '@core/active-sessions/actions'
import {
  get_all_active_sessions,
  get_active_sessions_count,
  get_prompt_snippets
} from '@core/active-sessions/selectors'
import { get_can_create_threads, get_app } from '@core/app/selectors.js'
import { get_thread_by_id } from '@core/threads/selectors.js'
import SessionCard from './SessionCard.js'
import normalize_thread from './normalize-thread.js'
import './HomeSessionsPanel.styl'

/**
 * Normalize an active session to the unified card format
 * @param {Object} session - Active session from Redux
 * @param {Function} get_thread - Function to get thread by ID from state
 * @returns {Object} Normalized item for SessionCard
 */
const normalize_session = (session, get_thread, prompt_snippets = {}) => {
  const is_running = session.status === 'active'
  const is_idle = session.status === 'idle'
  const has_thread = Boolean(session.thread_id)
  const is_redacted = Boolean(session.is_redacted)
  const can_write = session.can_write !== false

  // Check if associated thread is archived (or not found in store)
  const thread = has_thread ? get_thread(session.thread_id) : null
  const is_thread_archived = !thread || thread.thread_state === 'archived'

  // Show actions only for idle sessions with non-archived threads and write permission
  const show_actions =
    is_idle && has_thread && !is_redacted && !is_thread_archived && can_write

  return {
    id: session.thread_id,
    session_id: session.session_id,
    title:
      session.thread_title ||
      session.prompt_snippet ||
      prompt_snippets[session.session_id] ||
      (session.working_directory
        ? session.working_directory.split('/').pop() || 'root'
        : 'Unknown'),
    status: is_running ? 'running' : is_idle ? 'idle' : session.status,
    created_at: session.created_at,
    updated_at: session.last_activity_at,
    working_directory: session.working_directory,
    message_count: session.message_count,
    duration_minutes: session.duration_minutes,
    total_tokens: session.total_tokens,
    latest_timeline_event: session.latest_timeline_event,
    user_public_key: thread?.user_public_key || null,
    show_actions
  }
}

// Constants for display logic
const MIN_THREADS_TO_SHOW = 5

// Time period options in hours
const TIME_PERIODS = {
  '3d': { label: '3d', hours: 72 },
  '1w': { label: '1w', hours: 168 },
  '1m': { label: '1m', hours: 720 }
}

const HomeSessionsPanel = ({ threads, load_threads }) => {
  const dispatch = useDispatch()
  const active_sessions = useSelector(get_all_active_sessions)
  const active_session_count = useSelector(get_active_sessions_count)
  const prompt_snippets = useSelector(get_prompt_snippets)
  const can_create_threads = useSelector(get_can_create_threads)
  const app = useSelector(get_app)
  const user_public_key = app.get('user_public_key')
  const [sessions_collapsed, set_sessions_collapsed] = useState(true)
  const [threads_collapsed, set_threads_collapsed] = useState(true)
  const [selected_period, set_selected_period] = useState('3d')

  // Create a getter function for thread lookup
  const state = useSelector((s) => s)
  const get_thread = (thread_id) => get_thread_by_id(state, thread_id)

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

  // Calculate threads to display:
  // - Show all threads created within the selected time period
  // - Show at least 5 if there are more than 5 total
  const now = Date.now()
  const recent_hours = TIME_PERIODS[selected_period].hours
  const recent_cutoff = now - recent_hours * 60 * 60 * 1000

  const active_threads_list = List.isList(active_threads)
    ? active_threads.toJS()
    : active_threads

  // Filter threads by selected time period
  const recent_threads = active_threads_list.filter((thread) => {
    const created_at = new Date(thread.created_at).getTime()
    return created_at >= recent_cutoff
  })

  // Sort threads by created_at descending
  const sort_threads_by_created_at = (threads) => {
    return [...threads].sort((a, b) => {
      const a_created = new Date(a.created_at).getTime()
      const b_created = new Date(b.created_at).getTime()
      return b_created - a_created // Descending order
    })
  }

  // Show all recent threads, or at least MIN_THREADS_TO_SHOW if we have enough total threads
  const threads_to_display =
    recent_threads.length >= MIN_THREADS_TO_SHOW
      ? recent_threads
      : active_threads_list.slice(
          0,
          Math.min(MIN_THREADS_TO_SHOW, active_threads_list.length)
        )

  // Sort by created_at descending
  const displayed_threads = sort_threads_by_created_at(threads_to_display)

  const filtered_sessions =
    can_create_threads && user_public_key
      ? (active_sessions || []).filter((session) => {
          if (!session.thread_id) return true
          const thread = get_thread(session.thread_id)
          if (!thread) return true
          return thread.user_public_key === user_public_key
        })
      : active_sessions || []
  const filtered_session_count =
    can_create_threads && user_public_key
      ? filtered_sessions.length
      : active_session_count
  const has_active_sessions = filtered_session_count > 0
  const has_active_threads =
    active_threads.size > 0 || active_threads.length > 0

  // Don't render if nothing to show
  if (!has_active_sessions && !has_active_threads) {
    return null
  }

  const sessions_list = filtered_sessions
  const threads_list = displayed_threads

  return (
    <div className='home-sessions-panel'>
      {has_active_sessions && (
        <div className='home-sessions-panel__section'>
          <div
            className='home-section-header home-section-header--clickable'
            onClick={() => set_sessions_collapsed(!sessions_collapsed)}
            role='button'
            tabIndex={0}
            aria-expanded={!sessions_collapsed}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                set_sessions_collapsed(!sessions_collapsed)
              }
            }}>
            <span className='home-section-header__toggle'>
              {sessions_collapsed ? '+' : '-'}
            </span>
            <span className='home-section-header__dot home-section-header__dot--active' />
            <span className='home-section-header__title'>Active Sessions</span>
            <span className='home-section-header__count'>
              {filtered_session_count}
            </span>
          </div>
          {!sessions_collapsed && (
            <div className='home-sessions-panel__list'>
              {sessions_list.map((session) => (
                <SessionCard
                  key={session.session_id}
                  item={normalize_session(session, get_thread, prompt_snippets)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {has_active_threads && (
        <div className='home-sessions-panel__section'>
          <div className='home-section-header home-section-header--with-controls'>
            <div
              className='home-section-header__left home-section-header--clickable'
              onClick={() => set_threads_collapsed(!threads_collapsed)}
              role='button'
              tabIndex={0}
              aria-expanded={!threads_collapsed}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  set_threads_collapsed(!threads_collapsed)
                }
              }}>
              <span className='home-section-header__toggle'>
                {threads_collapsed ? '+' : '-'}
              </span>
              <span className='home-section-header__dot home-section-header__dot--review' />
              <span className='home-section-header__title'>
                Ready for Review
              </span>
              <Link
                to='/thread'
                className='home-section-header__count'
                onClick={(e) => e.stopPropagation()}>
                {active_threads.size || active_threads.length}
              </Link>
            </div>
            {!threads_collapsed && (
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
          {!threads_collapsed && (
            <div className='home-sessions-panel__list'>
              {threads_list.map((thread) => (
                <SessionCard
                  key={thread.thread_id}
                  item={normalize_thread(thread)}
                />
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
  load_threads: PropTypes.func
}

export default HomeSessionsPanel
