import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { List } from 'immutable'
import { ClickAwayListener } from '@mui/base'

import { active_sessions_actions } from '@core/active-sessions/actions'
import {
  get_all_sessions_with_pending,
  get_active_sessions_count,
  get_ended_sessions_count,
  get_pending_sessions,
  get_prompt_snippets
} from '@core/active-sessions/selectors'
import { get_can_create_threads, get_app } from '@core/app/selectors.js'
import { threads_actions } from '@core/threads/actions'
import { get_threads_state } from '@core/threads/index.js'
import SessionCard from '@components/SessionsPanel/SessionCard.js'
import normalize_thread from '@components/SessionsPanel/normalize-thread.js'
import './FloatingSessionsPanel.styl'

// Panel display modes
const PANEL_MODE = {
  COLLAPSED: 'collapsed',
  LIST: 'list',
  DETAIL: 'detail'
}

const FloatingSessionsPanel = () => {
  const dispatch = useDispatch()

  const all_sessions_raw = useSelector(get_all_sessions_with_pending)
  const active_session_count = useSelector(get_active_sessions_count)
  const ended_session_count = useSelector(get_ended_sessions_count)
  const pending_sessions = useSelector(get_pending_sessions)
  const prompt_snippets = useSelector(get_prompt_snippets)
  const can_create_threads = useSelector(get_can_create_threads)
  const app = useSelector(get_app)
  const user_public_key = app.get('user_public_key')
  const is_input_open = useSelector((state) =>
    state.getIn(['thread_prompt', 'is_open'], false)
  )
  const threads_state = useSelector(get_threads_state)
  const threads = threads_state.get('threads')

  const [panel_mode, set_panel_mode] = useState(PANEL_MODE.COLLAPSED)
  const [is_dismissed, set_is_dismissed] = useState(false)
  const [show_all_users, set_show_all_users] = useState(false)

  // Filter sessions by user ownership when authenticated with create_threads
  // Unless show_all_users is enabled
  const all_sessions =
    can_create_threads && user_public_key && !show_all_users
      ? (all_sessions_raw || []).filter((session) => {
          if (session.is_pending) return true
          if (!session.thread_id) return true
          if (!session.user_public_key) return true
          return session.user_public_key === user_public_key
        })
      : all_sessions_raw || []

  // Load active sessions and threads on mount and when show_all_users changes
  useEffect(() => {
    dispatch(active_sessions_actions.load_active_sessions())
    const params = {}
    if (can_create_threads && user_public_key && !show_all_users) {
      params.user_public_key = user_public_key
    }
    dispatch(threads_actions.load_threads(params))
  }, [dispatch, can_create_threads, user_public_key, show_all_users])

  // Auto-expand when a new pending session is created
  const pending_count = pending_sessions.length
  useEffect(() => {
    if (pending_count > 0) {
      set_is_dismissed(false)
      set_panel_mode(PANEL_MODE.LIST)
    }
  }, [pending_count])

  // Merge sessions and review threads into a single sorted list so that
  // resuming a review thread doesn't cause it to jump between sections.
  // Review threads = active threads without a corresponding active session.
  const { merged_items, review_count } = useMemo(() => {
    const active_session_thread_ids = new Set(
      (all_sessions || []).filter((s) => s.thread_id).map((s) => s.thread_id)
    )

    const session_items = (all_sessions || []).map((session) => ({
      type: session.is_pending ? 'pending' : 'session',
      session,
      sort_time: new Date(
        session.thread_created_at || session.created_at || session.started_at || 0
      ).getTime(),
      sort_id: session.session_id || session.job_id || session.pending_id || ''
    }))

    const threads_array = threads
      ? List.isList(threads)
        ? threads.toJS()
        : Array.isArray(threads)
          ? threads
          : []
      : []

    const review_threads = threads_array.filter(
      (t) =>
        t.thread_state === 'active' &&
        !active_session_thread_ids.has(t.thread_id) &&
        (show_all_users ||
          !can_create_threads ||
          !user_public_key ||
          !t.user_public_key ||
          t.user_public_key === user_public_key)
    )

    const review_items = review_threads.map((thread) => ({
      type: 'review',
      thread,
      sort_time: new Date(thread.created_at || 0).getTime(),
      sort_id: thread.thread_id || ''
    }))

    const combined = [...session_items, ...review_items]
    combined.sort((a, b) => {
      if (b.sort_time !== a.sort_time) return b.sort_time - a.sort_time
      return a.sort_id.localeCompare(b.sort_id)
    })
    return { merged_items: combined, review_count: review_threads.length }
  }, [all_sessions, threads, show_all_users, can_create_threads, user_public_key])

  const active_count = active_session_count + pending_sessions.length
  const total_count = active_count + ended_session_count + review_count

  const handle_collapse_click = useCallback(() => {
    if (panel_mode === PANEL_MODE.COLLAPSED) {
      set_panel_mode(PANEL_MODE.LIST)
    } else {
      set_panel_mode(PANEL_MODE.COLLAPSED)
    }
  }, [panel_mode])

  const handle_click_away = useCallback(() => {
    if (panel_mode !== PANEL_MODE.COLLAPSED) {
      set_panel_mode(PANEL_MODE.COLLAPSED)
    }
  }, [panel_mode])

  const handle_dismiss = useCallback(() => {
    set_is_dismissed(true)
    set_panel_mode(PANEL_MODE.COLLAPSED)
  }, [])

  const handle_toggle_all_users = useCallback((e) => {
    e.stopPropagation()
    set_show_all_users((prev) => !prev)
  }, [])

  const is_other_user_session = (session) => {
    if (!user_public_key || !session.user_public_key) return false
    return session.user_public_key !== user_public_key
  }

  const handle_retry = useCallback(
    (session) => {
      if (session.prompt_snippet && session.working_directory) {
        dispatch(
          threads_actions.create_thread_session({
            prompt: session.prompt_snippet,
            working_directory: session.working_directory
          })
        )
      }
    },
    [dispatch]
  )

  // Don't render if no sessions and dismissed
  if (total_count === 0 && is_dismissed) {
    return null
  }

  // Don't render if nothing to show
  if (total_count === 0) {
    return null
  }

  const format_directory = (path) => {
    if (!path) return 'Unknown'
    return path.split('/').pop() || 'root'
  }

  const has_active = all_sessions.some(
    (s) => !s.is_pending && s.status !== 'idle'
  )

  return (
    <ClickAwayListener onClickAway={handle_click_away}>
      <div
        className={`floating-sessions-panel floating-sessions-panel--${panel_mode}${is_input_open ? ' floating-sessions-panel--input-open' : ''}`}>
        {/* Collapsed bar */}
        <div
          className='floating-sessions-panel__bar'
          onClick={handle_collapse_click}>
          {panel_mode === PANEL_MODE.COLLAPSED ? (
            <>
              {active_count > 0 && (
                <span className='floating-sessions-panel__label-group'>
                  <span className='floating-sessions-panel__label-dot floating-sessions-panel__label-dot--active' />
                  <span className='floating-sessions-panel__label-text'>
                    Active
                  </span>
                  <span className='floating-sessions-panel__label-count'>
                    {active_count}
                  </span>
                </span>
              )}
              {review_count > 0 && (
                <span className='floating-sessions-panel__label-group'>
                  <span className='floating-sessions-panel__label-dot floating-sessions-panel__label-dot--review' />
                  <span className='floating-sessions-panel__label-text'>
                    Review
                  </span>
                  <span className='floating-sessions-panel__label-count'>
                    {review_count}
                  </span>
                </span>
              )}
            </>
          ) : (
            <>
              <span
                className={`floating-sessions-panel__indicator ${has_active ? 'floating-sessions-panel__indicator--active' : ''}`}
              />
              <span className='floating-sessions-panel__count'>
                {total_count} session{total_count !== 1 ? 's' : ''}
              </span>
              <button
                className='floating-sessions-panel__dismiss'
                onClick={(e) => {
                  e.stopPropagation()
                  handle_dismiss()
                }}>
                x
              </button>
            </>
          )}
        </div>

        {/* Expanded list mode */}
        {panel_mode === PANEL_MODE.LIST && (
          <div className='floating-sessions-panel__list'>
            {can_create_threads && user_public_key && (
              <div className='floating-sessions-panel__filter-row'>
                <button
                  className={`floating-sessions-panel__filter-toggle${show_all_users ? ' floating-sessions-panel__filter-toggle--active' : ''}`}
                  onClick={handle_toggle_all_users}
                  title={
                    show_all_users
                      ? 'Showing all users'
                      : 'Showing only your sessions'
                  }>
                  {show_all_users ? 'all users' : 'mine'}
                </button>
              </div>
            )}
            {merged_items.map((entry) => {
              if (entry.type === 'pending') {
                const session = entry.session
                return (
                  <div
                    key={`pending-${session.pending_id || session.job_id}`}
                    className='floating-sessions-panel__pending-item'>
                    <div className='floating-sessions-panel__pending-row'>
                      <span className='floating-sessions-panel__pending-status'>
                        {session.status === 'failed' ? (
                          <span className='floating-sessions-panel__status-failed'>
                            Failed
                          </span>
                        ) : (
                          <span className='floating-sessions-panel__status-queued'>
                            {session.status === 'queued'
                              ? 'Queued'
                              : 'Starting...'}
                          </span>
                        )}
                      </span>
                      <span className='floating-sessions-panel__pending-prompt'>
                        {session.prompt_snippet || 'New session'}
                      </span>
                    </div>
                    {session.status === 'failed' && (
                      <div className='floating-sessions-panel__pending-error'>
                        <span className='floating-sessions-panel__error-text'>
                          {session.error_message || 'Unknown error'}
                        </span>
                        <button
                          className='floating-sessions-panel__retry-button'
                          onClick={() => handle_retry(session)}>
                          retry
                        </button>
                      </div>
                    )}
                  </div>
                )
              }

              if (entry.type === 'review') {
                const thread = entry.thread
                const normalized = normalize_thread(thread)
                normalized.is_other_user =
                  user_public_key &&
                  thread.user_public_key &&
                  thread.user_public_key !== user_public_key
                return <SessionCard key={`review-${thread.thread_id}`} item={normalized} />
              }

              // Active/ended session - render as a compact card
              const session = entry.session
              const item = {
                id: session.thread_id,
                session_id: session.session_id,
                title:
                  session.thread_title ||
                  session.prompt_snippet ||
                  prompt_snippets[session.session_id] ||
                  format_directory(session.working_directory),
                status:
                  session.status === 'ended'
                    ? 'ended'
                    : session.status === 'idle'
                      ? 'idle'
                      : 'running',
                updated_at: session.last_activity_at,
                created_at: session.created_at || session.started_at,
                working_directory: session.working_directory,
                message_count: session.message_count,
                duration_minutes: session.duration_minutes,
                total_tokens: session.total_tokens,
                latest_timeline_event: session.latest_timeline_event,
                user_public_key: session.user_public_key,
                is_other_user: is_other_user_session(session),
                show_actions: false
              }

              return <SessionCard key={`session-${session.session_id}`} item={item} />
            })}

            {merged_items.length === 0 && (
              <div className='floating-sessions-panel__empty'>
                No active sessions
              </div>
            )}
          </div>
        )}
      </div>
    </ClickAwayListener>
  )
}

export default FloatingSessionsPanel
