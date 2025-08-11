import React from 'react'
import PropTypes from 'prop-types'
import ImmutablePropTypes from 'react-immutable-proptypes'
import { useNavigate } from 'react-router-dom'

import {
  format_shorthand_time,
  format_shorthand_number,
  format_duration
} from '@views/utils/date-formatting.js'
import ProviderLogo from '@views/components/primitives/ProviderLogo.js'
import './Thread.styl'

const Thread = ({ thread, is_focused = false }) => {
  const navigate = useNavigate()

  const handle_click = () => {
    navigate(`/thread/${thread.thread_id}`)
  }

  const get_state_color = (state) => {
    switch (state) {
      case 'active':
        return '#28a745'
      case 'paused':
        return '#ffc107'
      case 'terminated':
        return '#6c757d'
      default:
        return '#6c757d'
    }
  }

  const get_state_icon = (state) => {
    switch (state) {
      case 'active':
        return '●'
      case 'paused':
        return '⏸'
      case 'terminated':
        return '■'
      default:
        return '●'
    }
  }

  const working_directory_path =
    thread.external_session?.provider_metadata?.working_directory
  const working_directory = working_directory_path
    ? working_directory_path.split('/').pop() || 'root'
    : 'No working directory'
  const last_updated = format_shorthand_time(thread.updated_at)
  const title = thread.title
  const duration_minutes =
    thread.external_session?.provider_metadata?.duration_minutes
  const duration = duration_minutes
    ? `${parseFloat(duration_minutes.toFixed(1))}m`
    : format_duration(thread.created_at, thread.updated_at)
  const message_count = thread.external_session?.message_count || 0
  const token_count =
    thread.external_session?.provider_metadata?.total_tokens || 0
  const session_provider =
    thread.session_provider || thread.external_session?.session_provider

  return (
    <div
      className={`thread-card ${is_focused ? 'thread-card--focused' : ''}`}
      onClick={handle_click}>
      <div className='thread-header-row'>
        <div className='thread-status-info'>
          <div
            className='thread-state-indicator'
            style={{ color: get_state_color(thread.thread_state) }}
            title={`Status: ${thread.thread_state}`}>
            {get_state_icon(thread.thread_state)}
          </div>
          <span className='thread-time-info'>{last_updated}</span>
          {duration && <span className='thread-time-info'>{duration}</span>}
        </div>
        <div className='thread-provider-section'>
          {session_provider && (
            <ProviderLogo
              provider={session_provider}
              size={16}
              className='thread-provider-logo'
              title={`Provider: ${session_provider}`}
              decorative={false}
            />
          )}
        </div>
      </div>

      {title && <div className='thread-title'>{title}</div>}

      <div className='thread-metrics-row'>
        {message_count > 0 && (
          <span className='thread-message-count' title='Messages'>
            {message_count} msg{message_count !== 1 ? 's' : ''}
          </span>
        )}
        {token_count > 0 && (
          <span className='thread-token-count' title='Tokens'>
            {format_shorthand_number(token_count)} tokens
          </span>
        )}
      </div>

      <div className='thread-id-row'>
        <span className='thread-id-text'>{thread.thread_id}</span>
      </div>

      <div className='thread-working-directory-row'>
        <span className='thread-working-directory-text'>
          {working_directory}
        </span>
      </div>
    </div>
  )
}

Thread.propTypes = {
  thread: ImmutablePropTypes.map.isRequired,
  is_focused: PropTypes.bool
}

export default Thread
