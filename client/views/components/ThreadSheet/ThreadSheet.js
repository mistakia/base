import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import PropTypes from 'prop-types'
import { useSelector, useDispatch } from 'react-redux'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import { CircularProgress } from '@mui/material'

import {
  get_thread_sheet_sheets,
  get_thread_sheet_data_for_id,
  get_thread_sheet_is_loading_for_id,
  get_thread_sheet_error_for_id,
  thread_sheet_actions
} from '@core/thread-sheet/index.js'
import { threads_actions } from '@core/threads/actions'
import { get_active_session_for_thread } from '@core/active-sessions/selectors'
import {
  subscribe_to_thread,
  unsubscribe_from_thread
} from '@core/websocket/service'
import {
  extract_working_directory,
  extract_thread_title,
  extract_thread_description,
  extract_thread_state,
  extract_user_public_key
} from '@views/utils/thread-metadata-extractor.js'

import ThreadHeader from '@components/ThreadTimelineView/ThreadHeader'
import TimelineList from '@components/ThreadTimelineView/TimelineList'
import Button from '@components/primitives/Button'

import './ThreadSheet.styl'

// Inline thread resume input
const SheetThreadInput = ({ thread_id, thread_data, dispatch }) => {
  const input_ref = useRef(null)
  const [message, set_message] = useState('')
  const [is_submitting, set_is_submitting] = useState(false)

  const current_user_public_key = useSelector((state) =>
    state.getIn(['app', 'user_public_key'], null)
  )

  const thread_user_public_key = thread_data
    ? extract_user_public_key(thread_data)
    : null
  const can_resume =
    current_user_public_key &&
    thread_user_public_key &&
    current_user_public_key === thread_user_public_key

  const working_directory = thread_data
    ? extract_working_directory(thread_data).path
    : null

  const handle_submit = useCallback(
    (e) => {
      e.preventDefault()
      if (!message.trim() || !can_resume || is_submitting) return

      dispatch(
        threads_actions.resume_thread_session({
          thread_id,
          prompt: message,
          working_directory: working_directory || 'user:'
        })
      )
      set_is_submitting(true)
      set_message('')
      setTimeout(() => set_is_submitting(false), 2000)
    },
    [message, can_resume, is_submitting, dispatch, thread_id, working_directory]
  )

  const handle_key_down = useCallback(
    (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        handle_submit(e)
      }
    },
    [handle_submit]
  )

  const handle_form_submit = useCallback((e) => {
    e.preventDefault()
  }, [])

  const handle_change = useCallback((e) => {
    set_message(e.target.value)
    // Auto-resize textarea
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  if (!can_resume) return null

  const has_text = message.trim().length > 0

  return (
    <div className='thread-sheet__input'>
      <form onSubmit={handle_form_submit} className='thread-sheet__input-form'>
        <textarea
          ref={input_ref}
          value={message}
          onChange={handle_change}
          onKeyDown={handle_key_down}
          placeholder='Continue thread...'
          className='thread-sheet__input-field'
          disabled={is_submitting}
          rows={1}
        />
        <div className='thread-sheet__input-bottom-row'>
          <Button
            type='submit'
            variant='primary'
            icon
            disabled={!has_text || is_submitting}
            className={`thread-sheet__input-send ${has_text || is_submitting ? 'thread-sheet__input-send--visible' : ''}`}>
            {is_submitting ? (
              <CircularProgress size={14} style={{ color: '#fff' }} />
            ) : (
              <ArrowUpwardIcon style={{ fontSize: 14 }} />
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
SheetThreadInput.propTypes = {
  thread_id: PropTypes.string,
  thread_data: PropTypes.object,
  dispatch: PropTypes.func
}

// Individual sheet panel
const SingleThreadSheet = ({ thread_id, stack_index, stack_size }) => {
  const dispatch = useDispatch()
  const scroll_area_ref = useRef(null)
  const prev_timeline_length_ref = useRef(0)
  const [auto_scroll, set_auto_scroll] = useState(true)
  const [is_metadata_expanded, set_is_metadata_expanded] = useState(false)

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

  // Load thread data and subscribe to WebSocket
  useEffect(() => {
    dispatch(thread_sheet_actions.load_sheet_thread(thread_id))
    subscribe_to_thread(thread_id)

    return () => {
      unsubscribe_from_thread(thread_id)
    }
  }, [thread_id, dispatch])

  const handle_close = useCallback(() => {
    dispatch(thread_sheet_actions.close_thread_sheet(thread_id))
  }, [dispatch, thread_id])

  const timeline = thread_data?.get('timeline')
  const working_directory = thread_data
    ? extract_working_directory(thread_data).path
    : null

  const { thread_title, thread_description, thread_state } = useMemo(() => {
    if (!thread_data) return { thread_title: null, thread_description: null, thread_state: null }
    return {
      thread_title: extract_thread_title(thread_data),
      thread_description: extract_thread_description(thread_data),
      thread_state: extract_thread_state(thread_data)
    }
  }, [thread_data])
  const show_metadata_summary = thread_title || thread_state

  const toggle_metadata = useCallback(() => {
    set_is_metadata_expanded((prev) => !prev)
  }, [])

  // Scroll to bottom on initial load and auto-scroll on new entries
  useEffect(() => {
    const el = scroll_area_ref.current
    if (!el || !timeline) return

    const current_length = Array.isArray(timeline) ? timeline.length : 0
    const prev_length = prev_timeline_length_ref.current

    if (current_length > 0 && prev_length === 0) {
      // Initial load - scroll to bottom instantly
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight
      })
      set_auto_scroll(true)
    } else if (current_length > prev_length && auto_scroll) {
      // New entries while auto-scrolling
      requestAnimationFrame(() => {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
      })
    }

    prev_timeline_length_ref.current = current_length
  }, [timeline, auto_scroll])

  // Track scroll position for auto-scroll
  useEffect(() => {
    const el = scroll_area_ref.current
    if (!el) return

    const handle_scroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight
      const near_bottom = distance < 100
      set_auto_scroll(near_bottom)
    }

    el.addEventListener('scroll', handle_scroll, { passive: true })
    return () => el.removeEventListener('scroll', handle_scroll)
  }, [])

  // Calculate stacking transform
  const depth = stack_size - 1 - stack_index // 0 = topmost
  const scale = 1 - depth * 0.03
  const translate_x = depth * -12

  const style = {
    transform: `translateX(${translate_x}px) scale(${scale})`,
    zIndex: 1200 + stack_index
  }

  return (
    <div className='thread-sheet__panel' style={style}>
      {/* Fixed header: metadata summary + close */}
      <header className='thread-sheet__header'>
        {show_metadata_summary && (
          <div
            className='thread-sheet__metadata-summary'
            onClick={toggle_metadata}>
            <div className='thread-sheet__metadata-main'>
              {thread_title && (
                <span className='thread-sheet__metadata-title'>
                  {thread_title}
                </span>
              )}
              {thread_state && (
                <span
                  className={`thread-sheet__metadata-state thread-sheet__metadata-state--${thread_state}`}>
                  {thread_state}
                </span>
              )}
            </div>
            <button
              className={`thread-sheet__metadata-toggle ${is_metadata_expanded ? 'thread-sheet__metadata-toggle--expanded' : ''}`}
              aria-label={
                is_metadata_expanded ? 'Collapse metadata' : 'Expand metadata'
              }>
              <svg width='12' height='12' viewBox='0 0 12 12' fill='none'>
                <path
                  d='M3 5l3 3 3-3'
                  stroke='currentColor'
                  strokeWidth='1.5'
                  strokeLinecap='round'
                  strokeLinejoin='round'
                />
              </svg>
            </button>
          </div>
        )}
        <button
          className='thread-sheet__close'
          onClick={handle_close}
          aria-label='Close thread sheet'>
          <svg width='14' height='14' viewBox='0 0 14 14' fill='none'>
            <path
              d='M3 3l8 8M11 3l-8 8'
              stroke='currentColor'
              strokeWidth='1.5'
              strokeLinecap='round'
            />
          </svg>
        </button>
      </header>

      {/* Metadata body: description or expanded content (scrolls if needed) */}
      {(thread_description || is_metadata_expanded) && (
        <div className='thread-sheet__metadata-body'>
          {thread_description && !is_metadata_expanded && (
            <p className='thread-sheet__metadata-description'>
              {thread_description}
            </p>
          )}
          {is_metadata_expanded && thread_data && (
            <div className='thread-sheet__metadata-expanded'>
              <ThreadHeader metadata={thread_data} thread_id={thread_id} />
            </div>
          )}
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

      {/* Fixed thread input at bottom */}
      <SheetThreadInput
        thread_id={thread_id}
        thread_data={thread_data}
        dispatch={dispatch}
      />
    </div>
  )
}
SingleThreadSheet.propTypes = {
  thread_id: PropTypes.string,
  stack_index: PropTypes.number,
  stack_size: PropTypes.number
}

// Container that renders all stacked sheets
const ThreadSheet = () => {
  const sheets = useSelector(get_thread_sheet_sheets)

  if (!sheets || sheets.size === 0) {
    return null
  }

  const sheet_list = sheets.toJS()

  return (
    <div className='thread-sheet__container'>
      {sheet_list.map((thread_id, index) => (
        <SingleThreadSheet
          key={thread_id}
          thread_id={thread_id}
          stack_index={index}
          stack_size={sheet_list.length}
        />
      ))}
    </div>
  )
}

export default ThreadSheet
