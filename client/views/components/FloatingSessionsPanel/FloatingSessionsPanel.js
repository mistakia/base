import React, { useState, useEffect, useCallback } from 'react'
import { useSelector, useDispatch } from 'react-redux'

import { active_sessions_actions } from '@core/active-sessions/actions'
import {
  get_all_sessions_with_pending,
  get_active_sessions_count,
  get_pending_sessions,
  get_prompt_snippets
} from '@core/active-sessions/selectors'
import { threads_actions } from '@core/threads/actions'
import { get_thread_sheet_is_open } from '@core/thread-sheet/index.js'
import SessionCard from '@components/SessionsPanel/SessionCard.js'
import './FloatingSessionsPanel.styl'

// Panel display modes
const PANEL_MODE = {
  COLLAPSED: 'collapsed',
  LIST: 'list',
  DETAIL: 'detail'
}

const FloatingSessionsPanel = () => {
  const dispatch = useDispatch()

  const all_sessions = useSelector(get_all_sessions_with_pending)
  const active_session_count = useSelector(get_active_sessions_count)
  const pending_sessions = useSelector(get_pending_sessions)
  const prompt_snippets = useSelector(get_prompt_snippets)
  const thread_sheet_is_open = useSelector(get_thread_sheet_is_open)

  const [panel_mode, set_panel_mode] = useState(PANEL_MODE.COLLAPSED)
  const [is_dismissed, set_is_dismissed] = useState(false)

  // Load active sessions on mount
  useEffect(() => {
    dispatch(active_sessions_actions.load_active_sessions())
  }, [dispatch])

  // Auto-collapse when thread sheet opens
  useEffect(() => {
    if (thread_sheet_is_open) {
      set_panel_mode(PANEL_MODE.COLLAPSED)
    }
  }, [thread_sheet_is_open])

  // Auto-expand when a new pending session is created
  const pending_count = pending_sessions.length
  useEffect(() => {
    if (pending_count > 0) {
      set_is_dismissed(false)
      set_panel_mode(PANEL_MODE.LIST)
    }
  }, [pending_count])

  const total_count = active_session_count + pending_sessions.length

  const handle_collapse_click = useCallback(() => {
    if (panel_mode === PANEL_MODE.COLLAPSED) {
      set_panel_mode(PANEL_MODE.LIST)
    } else {
      set_panel_mode(PANEL_MODE.COLLAPSED)
      // Detail mode reset will go here
    }
  }, [panel_mode])

  const handle_dismiss = useCallback(() => {
    set_is_dismissed(true)
    set_panel_mode(PANEL_MODE.COLLAPSED)
  }, [])

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

  // Don't render if no sessions at all
  if (total_count === 0 && all_sessions.length === 0) {
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
    <div
      className={`floating-sessions-panel floating-sessions-panel--${panel_mode}`}>
      {/* Collapsed bar */}
      <div
        className='floating-sessions-panel__bar'
        onClick={handle_collapse_click}>
        <span
          className={`floating-sessions-panel__indicator ${has_active ? 'floating-sessions-panel__indicator--active' : ''}`}
        />
        <span className='floating-sessions-panel__count'>
          {panel_mode === PANEL_MODE.COLLAPSED
            ? total_count
            : `${total_count} session${total_count !== 1 ? 's' : ''}`}
        </span>
        {panel_mode !== PANEL_MODE.COLLAPSED && (
          <button
            className='floating-sessions-panel__dismiss'
            onClick={(e) => {
              e.stopPropagation()
              handle_dismiss()
            }}>
            x
          </button>
        )}
      </div>

      {/* Expanded list mode */}
      {panel_mode === PANEL_MODE.LIST && (
        <div className='floating-sessions-panel__list'>
          {all_sessions.map((session) => {
            if (session.is_pending) {
              return (
                <div
                  key={session.pending_id || session.job_id}
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

            // Active session - render as a compact card
            const item = {
              id: session.thread_id,
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
              created_at: session.started_at,
              working_directory: session.working_directory,
              message_count: session.message_count,
              duration_minutes: session.duration_minutes,
              total_tokens: session.total_tokens,
              latest_timeline_event: session.latest_timeline_event,
              user_public_key: session.user_public_key,
              show_actions: false
            }

            return <SessionCard key={session.session_id} item={item} />
          })}

          {all_sessions.length === 0 && (
            <div className='floating-sessions-panel__empty'>
              No active sessions
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default FloatingSessionsPanel
