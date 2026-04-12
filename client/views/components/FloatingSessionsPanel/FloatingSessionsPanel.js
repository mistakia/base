import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { List } from 'immutable'
import { ClickAwayListener } from '@mui/base'

import { active_sessions_actions } from '@core/active-sessions/actions'
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

  // Load active sessions and threads on mount
  useEffect(() => {
    dispatch(active_sessions_actions.load_active_sessions())
    const params = {}
    if (can_create_threads && user_public_key && !show_all_users) {
      params.user_public_key = user_public_key
    }
    dispatch(threads_actions.load_threads(params))
  }, [dispatch, can_create_threads, user_public_key, show_all_users])

  // Build unified thread list sorted by created_at descending
  const { thread_items, active_count, review_count } = useMemo(() => {
    const threads_array = threads
      ? List.isList(threads)
        ? threads.toJS()
        : Array.isArray(threads)
          ? threads
          : []
      : []

    const active_threads = threads_array.filter(
      (t) =>
        t.thread_state === 'active' &&
        (show_all_users ||
          !can_create_threads ||
          !user_public_key ||
          !t.user_public_key ||
          t.user_public_key === user_public_key)
    )

    const items = active_threads
      .map((thread) => ({
        thread,
        sort_time: new Date(thread.created_at || 0).getTime()
      }))
      .sort((a, b) => b.sort_time - a.sort_time)

    const active = active_threads.filter((t) =>
      ['queued', 'starting', 'active', 'idle'].includes(t.session_status)
    ).length
    const review = active_threads.filter(
      (t) => !t.session_status || t.session_status === 'completed'
    ).length

    return { thread_items: items, active_count: active, review_count: review }
  }, [threads, show_all_users, can_create_threads, user_public_key])

  const total_count = thread_items.length

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

  // Don't render if nothing to show
  if (total_count === 0 && is_dismissed) {
    return null
  }

  if (total_count === 0) {
    return null
  }

  const has_active = active_count > 0

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
                {total_count} thread{total_count !== 1 ? 's' : ''}
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
                      : 'Showing only your threads'
                  }>
                  {show_all_users ? 'all users' : 'mine'}
                </button>
              </div>
            )}
            {thread_items.map((entry) => {
              const thread = entry.thread
              const normalized = normalize_thread(thread)
              normalized.is_other_user =
                user_public_key &&
                thread.user_public_key &&
                thread.user_public_key !== user_public_key
              return (
                <SessionCard
                  key={thread.thread_id}
                  item={normalized}
                />
              )
            })}

            {thread_items.length === 0 && (
              <div className='floating-sessions-panel__empty'>
                No active threads
              </div>
            )}
          </div>
        )}
      </div>
    </ClickAwayListener>
  )
}

export default FloatingSessionsPanel
