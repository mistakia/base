import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { Drawer } from 'vaul'

import {
  get_thread_sheet_is_open,
  get_thread_sheet_thread_id,
  get_thread_sheet_data,
  get_thread_sheet_is_loading,
  get_thread_sheet_error,
  thread_sheet_actions
} from '@core/thread-sheet/index.js'
import { get_active_session_for_thread } from '@core/active-sessions/selectors'
import {
  subscribe_to_thread,
  unsubscribe_from_thread
} from '@core/websocket/service'
import { extract_working_directory } from '@views/utils/thread-metadata-extractor.js'

import ThreadHeader from '@components/ThreadTimelineView/ThreadHeader'
import TimelineList from '@components/ThreadTimelineView/TimelineList'

import './ThreadSheet.styl'

const DESKTOP_BREAKPOINT = 768

const use_is_desktop = () => {
  const [is_desktop, set_is_desktop] = useState(
    () => window.innerWidth >= DESKTOP_BREAKPOINT
  )

  useEffect(() => {
    const media_query = window.matchMedia(
      `(min-width: ${DESKTOP_BREAKPOINT}px)`
    )
    const handle_change = (event) => set_is_desktop(event.matches)
    media_query.addEventListener('change', handle_change)
    return () => media_query.removeEventListener('change', handle_change)
  }, [])

  return is_desktop
}

const ThreadSheet = () => {
  const dispatch = useDispatch()
  const is_open = useSelector(get_thread_sheet_is_open)
  const thread_id = useSelector(get_thread_sheet_thread_id)
  const is_desktop = use_is_desktop()

  const thread_data = useSelector(get_thread_sheet_data)
  const is_loading = useSelector(get_thread_sheet_is_loading)
  const error = useSelector(get_thread_sheet_error)

  const active_session_selector = useMemo(
    () => (state) => get_active_session_for_thread(state, thread_id),
    [thread_id]
  )
  const active_session = useSelector(active_session_selector)

  // Load thread data and subscribe to WebSocket when sheet opens
  useEffect(() => {
    if (is_open && thread_id) {
      dispatch(thread_sheet_actions.load_sheet_thread(thread_id))
      subscribe_to_thread(thread_id)
    }

    return () => {
      if (thread_id) {
        unsubscribe_from_thread(thread_id)
      }
    }
  }, [is_open, thread_id, dispatch])

  const handle_open_change = useCallback(
    (open) => {
      if (!open) {
        dispatch(thread_sheet_actions.close_thread_sheet())
      }
    },
    [dispatch]
  )

  const direction = is_desktop ? 'right' : 'bottom'
  const timeline = thread_data?.get('timeline')
  const working_directory = thread_data
    ? extract_working_directory(thread_data).path
    : null

  return (
    <Drawer.Root
      open={is_open}
      onOpenChange={handle_open_change}
      direction={direction}
      handleOnly={is_desktop}>
      <Drawer.Portal>
        <Drawer.Overlay className='thread-sheet__overlay' />
        <Drawer.Content
          className={`thread-sheet__content thread-sheet__content--${direction}`}
          aria-describedby={undefined}>
          {!is_desktop && <Drawer.Handle />}
          <div className='thread-sheet__header'>
            <Drawer.Title className='thread-sheet__title'>
              Thread
            </Drawer.Title>
            <button
              className='thread-sheet__close'
              onClick={() => handle_open_change(false)}
              aria-label='Close thread sheet'>
              &times;
            </button>
          </div>
          <div className='thread-sheet__scroll-area'>
            {is_loading && (
              <div className='thread-sheet__loading'>Loading thread...</div>
            )}
            {error && (
              <div className='thread-sheet__error'>
                Error loading thread: {error}
              </div>
            )}
            {!is_loading && !error && (!timeline || timeline.length === 0) && (
              <div className='thread-sheet__empty'>
                No timeline data available
              </div>
            )}
            {!is_loading && !error && timeline && timeline.length > 0 && (
              <div className='thread-sheet__body'>
                <div className='thread-sheet__timeline'>
                  <TimelineList
                    timeline={timeline}
                    working_directory={working_directory}
                    active_session={active_session}
                  />
                </div>
                <div className='thread-sheet__sidebar'>
                  <ThreadHeader
                    metadata={thread_data}
                    thread_id={thread_id}
                  />
                </div>
              </div>
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

export default ThreadSheet
