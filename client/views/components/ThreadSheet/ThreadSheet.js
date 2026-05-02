import React, { useEffect, useCallback, useMemo, useRef } from 'react'
import PropTypes from 'prop-types'
import { useSelector, useDispatch } from 'react-redux'

import {
  get_thread_sheet_active_sheet,
  get_thread_sheet_data_for_id,
  get_thread_sheet_is_loading_for_id,
  get_thread_sheet_error_for_id,
  thread_sheet_actions
} from '@core/thread-sheet/index.js'
import {
  get_active_session_for_thread,
  get_active_session_by_id
} from '@core/active-sessions/selectors'
import { get_thread_pending_resume } from '@core/threads/selectors'
import {
  subscribe_to_thread,
  unsubscribe_from_thread
} from '@core/websocket/service'
import {
  extract_working_directory,
  extract_user_public_key
} from '@views/utils/thread-metadata-extractor.js'

import ThreadHeader from '@components/ThreadTimelineView/ThreadHeader'
import TimelineList from '@components/ThreadTimelineView/TimelineList'
import UserMessage from '@components/ThreadTimelineView/UserMessage'
import ThreadLifecycleIndicator from '@components/ThreadLifecycleIndicator/ThreadLifecycleIndicator.js'
import ThreadInputTrigger from '@components/ThreadInputTrigger/ThreadInputTrigger.js'

import './ThreadSheet.styl'

// Resume status indicator
const ResumeStatusIndicator = ({ pending_resume }) => {
  const status = pending_resume.get('status')
  const queue_position = pending_resume.get('queue_position')
  const error_message = pending_resume.get('error_message')

  let badge_label
  switch (status) {
    case 'submitted':
      badge_label = 'submitted'
      break
    case 'queued':
      badge_label = queue_position ? `queued #${queue_position}` : 'queued'
      break
    case 'starting':
      badge_label = 'starting'
      break
    case 'failed':
      badge_label = 'failed'
      break
    default:
      badge_label = 'resuming'
  }

  return (
    <div
      className={`thread-sheet__resume-status thread-sheet__resume-status--${status}`}>
      <div className='thread-sheet__resume-status-header'>
        <span className='thread-sheet__resume-status-badge'>{badge_label}</span>
      </div>
      {status === 'failed' && (
        <span className='thread-sheet__resume-status-error'>
          {error_message || 'Unknown error'}
        </span>
      )}
    </div>
  )
}
ResumeStatusIndicator.propTypes = {
  pending_resume: PropTypes.object
}

const close_button_svg = (
  <svg width='14' height='14' viewBox='0 0 14 14' fill='none'>
    <path
      d='M3 3l8 8M11 3l-8 8'
      stroke='currentColor'
      strokeWidth='1.5'
      strokeLinecap='round'
    />
  </svg>
)

// Individual sheet panel
const SingleThreadSheet = ({ thread_id }) => {
  const dispatch = useDispatch()
  const scroll_area_ref = useRef(null)

  const thread_data = useSelector((state) =>
    get_thread_sheet_data_for_id(state, thread_id)
  )
  const is_loading = useSelector((state) =>
    get_thread_sheet_is_loading_for_id(state, thread_id)
  )
  const error = useSelector((state) =>
    get_thread_sheet_error_for_id(state, thread_id)
  )

  const active_session_selector = useMemo(
    () => (state) => get_active_session_for_thread(state, thread_id),
    [thread_id]
  )
  const active_session = useSelector(active_session_selector)

  const pending_resume_selector = useMemo(
    () => (state) => get_thread_pending_resume(state, thread_id),
    [thread_id]
  )
  const pending_resume = useSelector(pending_resume_selector)

  useEffect(() => {
    dispatch(thread_sheet_actions.load_sheet_thread(thread_id))
    subscribe_to_thread(thread_id)

    return () => {
      unsubscribe_from_thread(thread_id)
    }
  }, [thread_id, dispatch])

  const handle_close = useCallback(() => {
    dispatch(thread_sheet_actions.close_all_sheets())
  }, [dispatch])

  const timeline = thread_data?.get('timeline')
  const working_directory = thread_data
    ? extract_working_directory(thread_data).path
    : null
  const thread_user_public_key = thread_data
    ? extract_user_public_key(thread_data)
    : null

  // Scroll to bottom on initial timeline load
  const has_scrolled_ref = useRef(false)
  useEffect(() => {
    const el = scroll_area_ref.current
    if (!el || !timeline || timeline.length === 0) return
    if (has_scrolled_ref.current) return
    has_scrolled_ref.current = true
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
    })
  }, [timeline])

  const header_actions = (
    <button
      className='thread-sheet__close'
      onClick={handle_close}
      aria-label='Close thread sheet'>
      {close_button_svg}
    </button>
  )

  return (
    <div className='thread-sheet__panel'>
      {thread_data && (
        <div className='thread-sheet__header-area'>
          <ThreadHeader
            metadata={thread_data}
            thread_id={thread_id}
            collapsible
            default_collapsed
            actions={header_actions}
            title_href={`/thread/${thread_id}`}
            sx={{ marginTop: 0, borderRadius: 0, border: 'none' }}
          />
        </div>
      )}

      {/* Scrollable timeline area */}
      <div className='thread-sheet__scroll-area' ref={scroll_area_ref}>
        {is_loading && (
          <div className='thread-sheet__loading'>Loading thread...</div>
        )}
        {error && (
          <div className='thread-sheet__error'>
            Error loading thread: {error}
          </div>
        )}
        {!is_loading && !error && (!timeline || timeline.length === 0) && (
          <div className='thread-sheet__empty'>No timeline data available</div>
        )}
        {!is_loading && !error && timeline && timeline.length > 0 && (
          <div className='thread-sheet__timeline'>
            <TimelineList
              timeline={timeline}
              working_directory={working_directory}
              active_session={active_session}
              scroll_container_ref={scroll_area_ref}
            />
          </div>
        )}
      </div>

      {/* Pending resume status indicator */}
      {pending_resume && (
        <ResumeStatusIndicator pending_resume={pending_resume} />
      )}

      {/* Canonical bottom-of-thread lifecycle indicator (above composer).
          Suppressed while a pending_resume is showing -- the resume indicator
          covers the same queued/starting/failed states and adds the error
          message; rendering both stacks two "Failed" rows. */}
      {!pending_resume && thread_data && thread_data.get('session_status') && (
        <ThreadLifecycleIndicator
          status={thread_data.get('session_status')}
          thread_id={thread_id}
          user_message_count={thread_data.get('user_message_count') || 0}
          variant='footer'
        />
      )}

      {/* Trigger to open the full-featured global input */}
      <div className='thread-sheet__input-trigger'>
        <ThreadInputTrigger
          thread_id={thread_id}
          thread_user_public_key={thread_user_public_key}
        />
      </div>
    </div>
  )
}
SingleThreadSheet.propTypes = {
  thread_id: PropTypes.string
}

// Session-only sheet panel (before thread exists)
const SessionSheetPanel = ({ sheet_key }) => {
  const dispatch = useDispatch()
  const session_id = sheet_key.replace('session:', '')

  const session = useSelector((state) =>
    get_active_session_by_id(state, session_id)
  )
  const session_status = useSelector((state) =>
    state.getIn(['thread_sheet', 'sheet_data', sheet_key, 'session_status'])
  )

  // When session gains a thread_id, transition to thread sheet atomically
  const session_thread_id = session?.thread_id
  useEffect(() => {
    if (session_thread_id) {
      dispatch(
        thread_sheet_actions.open_thread_sheet({ thread_id: session_thread_id })
      )
    }
  }, [session_thread_id, dispatch])

  const handle_close = useCallback(() => {
    dispatch(thread_sheet_actions.close_all_sheets())
  }, [dispatch])

  const status = session_status || session?.status || 'starting'
  const working_directory = session?.working_directory
  const prompt_snippet = session?.prompt_snippet

  return (
    <div className='thread-sheet__panel'>
      <div className='thread-sheet__session-header'>
        <span className='thread-sheet__session-title'>
          {prompt_snippet || 'New Session'}
        </span>
        <span
          className={`thread-sheet__metadata-state thread-sheet__metadata-state--${status === 'ended' ? 'ended' : 'active'}`}>
          {status}
        </span>
        <button
          className='thread-sheet__close'
          onClick={handle_close}
          aria-label='Close session sheet'>
          {close_button_svg}
        </button>
      </div>
      <div className='thread-sheet__scroll-area'>
        <div className='thread-sheet__timeline' style={{ paddingTop: 24 }}>
          {prompt_snippet && (
            <UserMessage
              message={{ content: prompt_snippet }}
              working_directory={working_directory}
            />
          )}
          {status !== 'ended' && (
            <ThreadLifecycleIndicator
              status={status}
              thread_id={session_thread_id || session_id}
              variant='inline'
            />
          )}
        </div>
      </div>
    </div>
  )
}
SessionSheetPanel.propTypes = {
  sheet_key: PropTypes.string
}

// Container that renders the active sheet and manages layout class.
// Always mounted so CSS can animate the slide in/out.
const ThreadSheet = () => {
  const active_sheet = useSelector(get_thread_sheet_active_sheet)
  const is_open = !!active_sheet

  useEffect(() => {
    const el = document.body
    if (is_open) {
      el.classList.add('thread-sheet-open')
    } else {
      el.classList.remove('thread-sheet-open')
    }
    return () => el.classList.remove('thread-sheet-open')
  }, [is_open])

  return (
    <div
      className={`thread-sheet__container ${is_open ? 'thread-sheet__container--open' : ''}`}>
      {active_sheet &&
        (active_sheet.startsWith('session:') ? (
          <SessionSheetPanel key={active_sheet} sheet_key={active_sheet} />
        ) : (
          <SingleThreadSheet key={active_sheet} thread_id={active_sheet} />
        ))}
    </div>
  )
}

export default ThreadSheet
