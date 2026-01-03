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
import { get_thread_by_id } from '@core/threads/selectors.js'
import SessionCard from './SessionCard.js'
import './HomeSessionsPanel.styl'

/**
 * Normalize an active session to the unified card format
 * @param {Object} session - Active session from Redux
 * @param {Function} get_thread - Function to get thread by ID from state
 * @returns {Object} Normalized item for SessionCard
 */
const normalize_session = (session, get_thread) => {
  const is_running = session.status === 'active'
  const is_idle = session.status === 'idle'
  const has_thread = Boolean(session.thread_id)
  const is_redacted = Boolean(session.is_redacted)

  // Check if associated thread is archived
  const thread = has_thread ? get_thread(session.thread_id) : null
  const is_thread_archived = thread?.thread_state === 'archived'

  // Show actions only for idle sessions with non-archived threads
  const show_actions =
    is_idle && has_thread && !is_redacted && !is_thread_archived

  return {
    id: session.thread_id,
    title:
      session.thread_title ||
      (session.working_directory
        ? session.working_directory.split('/').pop() || 'root'
        : 'Unknown'),
    status: is_running ? 'running' : 'idle',
    updated_at: session.last_activity_at,
    working_directory: session.working_directory,
    message_count: session.message_count,
    duration_minutes: session.duration_minutes,
    total_tokens: session.total_tokens,
    latest_timeline_event: session.latest_timeline_event,
    show_actions
  }
}

/**
 * Normalize a thread to the unified card format
 * @param {Object} thread - Thread from Redux
 * @returns {Object} Normalized item for SessionCard
 */
const normalize_thread = (thread) => {
  const working_directory =
    thread.working_directory ||
    thread.external_session?.provider_metadata?.working_directory

  const duration_minutes =
    thread.duration_minutes ||
    thread.external_session?.provider_metadata?.duration_minutes

  // Show actions for active threads (ready for review)
  const show_actions = thread.thread_state === 'active'

  return {
    id: thread.thread_id,
    title: thread.title,
    status: thread.thread_state === 'active' ? 'review' : 'archived',
    updated_at: thread.updated_at,
    working_directory,
    message_count: thread.message_count,
    duration_minutes,
    total_tokens:
      thread.total_tokens ||
      thread.external_session?.provider_metadata?.total_tokens,
    latest_timeline_event: thread.latest_timeline_event || null,
    show_actions
  }
}

const HomeSessionsPanel = ({ threads, load_threads, max_threads = 3 }) => {
  const dispatch = useDispatch()
  const active_sessions = useSelector(get_all_active_sessions)
  const active_session_count = useSelector(get_active_sessions_count)
  const [sessions_collapsed, set_sessions_collapsed] = useState(true)
  const [threads_collapsed, set_threads_collapsed] = useState(true)

  // Create a getter function for thread lookup
  const state = useSelector((s) => s)
  const get_thread = (thread_id) => get_thread_by_id(state, thread_id)

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
              {active_session_count}
            </span>
          </div>
          {!sessions_collapsed && (
            <div className='home-sessions-panel__list'>
              {sessions_list.map((session) => (
                <SessionCard
                  key={session.session_id}
                  item={normalize_session(session, get_thread)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {has_active_threads && (
        <div className='home-sessions-panel__section'>
          <div
            className='home-section-header home-section-header--clickable'
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
            <span className='home-section-header__title'>Ready for Review</span>
            <Link
              to='/thread'
              className='home-section-header__count'
              onClick={(e) => e.stopPropagation()}>
              {active_threads.size || active_threads.length}
            </Link>
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
  load_threads: PropTypes.func,
  max_threads: PropTypes.number
}

export default HomeSessionsPanel
