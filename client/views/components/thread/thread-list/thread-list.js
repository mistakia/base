import React, { useEffect } from 'react'
import { Link } from 'react-router-dom'
import PropTypes from 'prop-types'
import { format } from 'date-fns'

import './thread-list.styl'

// Format the timestamp
const format_date = (timestamp) => {
  if (!timestamp) return ''
  return format(new Date(timestamp), 'MMM d, yyyy h:mm a')
}

// Get the first message from a thread
const get_first_message = (thread) => {
  if (!thread) return null

  const timeline = thread.get('timeline')
  if (!timeline || timeline.size === 0) return null

  // Find the first user message
  const first_message = timeline.find(
    (entry) => entry.get('type') === 'message' && entry.get('role') === 'user'
  )

  return first_message ? first_message.get('content') : null
}

const ThreadList = ({
  threads,
  loading,
  error,
  current_thread_id,
  load_threads,
  user_id
}) => {
  // Load threads on component mount
  useEffect(() => {
    if (user_id) {
      load_threads()
    }
  }, [user_id, load_threads])

  if (loading) {
    return <div className='loading-state'>Loading threads...</div>
  }

  if (error) {
    return <div className='error-state'>Error loading threads: {error}</div>
  }

  if (!threads || threads.size === 0) {
    return (
      <div className='empty-state'>
        <h3>No threads yet</h3>
        <p>Start a conversation with an AI assistant</p>
        <Link className='create-button' to='/threads/new'>
          Create New Thread
        </Link>
      </div>
    )
  }

  return (
    <div className='thread-list-container'>
      {threads.map((thread) => {
        const thread_id = thread.get('thread_id')
        const state = thread.get('state')
        const first_message = get_first_message(thread) || 'New thread'
        const title =
          first_message.length > 60
            ? `${first_message.substring(0, 60)}...`
            : first_message

        return (
          <Link
            className={`thread-item ${thread_id === current_thread_id ? 'active' : ''}`}
            key={thread_id}
            to={`/threads/${thread_id}`}>
            <div className='thread-title'>{title}</div>
            <div className='thread-model'>
              {thread.get('inference_provider')} / {thread.get('model')}
            </div>
            <div className='thread-meta'>
              <span className={`thread-state ${state}`}>{state}</span>
              <span>{format_date(thread.get('updated_at'))}</span>
            </div>
          </Link>
        )
      })}
    </div>
  )
}

ThreadList.propTypes = {
  threads: PropTypes.object,
  loading: PropTypes.bool,
  error: PropTypes.any,
  current_thread_id: PropTypes.string,
  load_threads: PropTypes.func.isRequired,
  user_id: PropTypes.string
}

export default ThreadList
