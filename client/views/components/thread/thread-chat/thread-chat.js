import React, { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import InfoIcon from '@mui/icons-material/Info'
import PlayCircleIcon from '@mui/icons-material/PlayCircle'
import PauseCircleIcon from '@mui/icons-material/PauseCircle'
import StopCircleIcon from '@mui/icons-material/StopCircle'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { Link } from 'react-router-dom'

import { thread_constants } from '@libs-shared/index.mjs'
import MessageBubble from '@components/thread/message-bubble'
import MessageInput from '@components/thread/message-input'
import ErrorBoundary from '@components/error-boundary'

import './thread-chat.styl'

// Initialize the relativeTime plugin
dayjs.extend(relativeTime)

// Use the imported thread constants
const { THREAD_STATUS } = thread_constants

// Thread chat component that displays messages and allows sending new ones
const ThreadChat = ({
  thread_id,
  thread_status,
  messages,
  is_loading,
  error,
  last_updated,
  load_thread,
  add_message,
  update_status
}) => {
  const messages_container_ref = useRef(null)
  const [is_at_bottom, set_is_at_bottom] = useState(true)

  // Fetch thread data (including messages) on component mount or when thread_id changes
  useEffect(() => {
    if (thread_id && load_thread) {
      // Pass the expected payload object
      load_thread({ thread_id })
    }
    // Reset scroll state when thread changes
    set_is_at_bottom(true)
  }, [thread_id, load_thread])

  // Scroll to bottom when new messages are added, but only if already at bottom
  useEffect(() => {
    if (is_at_bottom && messages_container_ref.current) {
      scroll_to_bottom()
    }
  }, [messages, is_at_bottom]) // Depend on is_at_bottom

  // Handle scroll events to determine if user is at the bottom of chat
  useEffect(() => {
    const container = messages_container_ref.current
    if (!container) return

    const handle_scroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      const scroll_position = scrollTop + clientHeight
      const is_scrolled_to_bottom =
        Math.abs(scrollHeight - scroll_position) < 30

      set_is_at_bottom(is_scrolled_to_bottom)
    }

    container.addEventListener('scroll', handle_scroll)
    return () => container.removeEventListener('scroll', handle_scroll)
  }, []) // Empty dependency array ensures this runs once on mount

  // Scroll to the bottom of the messages container
  const scroll_to_bottom = () => {
    if (messages_container_ref.current) {
      messages_container_ref.current.scrollTop =
        messages_container_ref.current.scrollHeight
    }
  }

  // Handle sending a new message
  const handle_send_message = (content) => {
    if (!content.trim() || !thread_id || !add_message) return

    // Pass the expected payload object
    add_message({ thread_id, content })
    // Optimistic update is now handled by the reducer/saga
  }

  // Handle thread status changes
  const handle_status_change = (new_status) => {
    if (!thread_id || !update_status) return
    // Pass the expected payload object
    update_status({ thread_id, state: new_status })
  }

  // Render status controls based on current thread status
  const render_status_controls = () => {
    switch (thread_status) {
      case THREAD_STATUS.ACTIVE:
        return (
          <button
            className='status-button pause'
            onClick={() => handle_status_change(THREAD_STATUS.PAUSED)}>
            <PauseCircleIcon />
            Pause
          </button>
        )
      case THREAD_STATUS.PAUSED:
        return (
          <>
            <button
              className='status-button resume'
              onClick={() => handle_status_change(THREAD_STATUS.ACTIVE)}>
              <PlayCircleIcon />
              Resume
            </button>
            <button
              className='status-button terminate'
              onClick={() => handle_status_change(THREAD_STATUS.TERMINATED)}>
              <StopCircleIcon />
              Terminate
            </button>
          </>
        )
      case THREAD_STATUS.TERMINATED:
        return null
      default:
        return null
    }
  }

  // Render the status indicator
  const render_status_indicator = () => {
    let status_text = ''
    let status_class = ''

    switch (thread_status) {
      case THREAD_STATUS.ACTIVE:
        status_text = 'Active'
        status_class = 'active'
        break
      case THREAD_STATUS.PAUSED:
        status_text = 'Paused'
        status_class = 'paused'
        break
      case THREAD_STATUS.TERMINATED:
        status_text = 'Terminated'
        status_class = 'terminated'
        break
      default:
        status_text = 'Unknown'
    }

    return (
      <div className='thread-status'>
        <span className={status_class}></span>
        {status_text}
      </div>
    )
  }

  // If there's no thread_id, show a placeholder
  if (!thread_id) {
    return (
      <div className='chat-container'>
        <div className='thread-placeholder'>
          <InfoIcon sx={{ fontSize: 32 }} />
          <p>Select a thread to view messages</p>
        </div>
      </div>
    )
  }

  // Display loading state when loading and no thread data yet
  if (is_loading && messages.length === 0) {
    return <div className='loading-state'>Loading thread...</div>
  }

  // Display error state
  if (error) {
    return (
      <div className='error-state'>
        <h3>Error loading thread</h3>
        <p>{error}</p>
        <Link to='/threads' className='back-button'>
          Back to threads
        </Link>
      </div>
    )
  }

  return (
    <div className='chat-container'>
      <div className='thread-header'>
        <div className='thread-info'>
          {render_status_indicator()}
          {last_updated && <span>Updated {dayjs(last_updated).fromNow()}</span>}
        </div>
        <div className='thread-controls'>{render_status_controls()}</div>
      </div>

      <div className='messages-container' ref={messages_container_ref}>
        {messages.length === 0 ? (
          <div className='empty-message'>
            No messages yet. Start a conversation!
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <ErrorBoundary key={message.id}>
                <MessageBubble message={message} />
              </ErrorBoundary>
            ))}
          </>
        )}
        {is_loading && (
          <div className='loading-indicator'>
            <div className='typing-indicator'>
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}
      </div>

      <MessageInput
        onSendMessage={handle_send_message}
        disabled={thread_status === THREAD_STATUS.TERMINATED}
        placeholder={
          thread_status === THREAD_STATUS.TERMINATED
            ? 'This thread has been terminated'
            : 'Type a message...'
        }
      />
    </div>
  )
}

ThreadChat.propTypes = {
  thread_id: PropTypes.string,
  thread_status: PropTypes.oneOf(Object.values(THREAD_STATUS)),
  messages: PropTypes.array,
  is_loading: PropTypes.bool,
  error: PropTypes.object, // Error might be an object
  last_updated: PropTypes.string,
  load_thread: PropTypes.func.isRequired,
  add_message: PropTypes.func.isRequired,
  update_status: PropTypes.func.isRequired
}

ThreadChat.defaultProps = {
  thread_id: null,
  thread_status: THREAD_STATUS.ACTIVE, // Default status
  messages: [],
  is_loading: false,
  error: null,
  last_updated: null
}

// Remove connect HOC export
export default ThreadChat
