import React from 'react'
import PropTypes from 'prop-types'
import { useNavigate } from 'react-router-dom'
import { useDispatch } from 'react-redux'

import { format_shorthand_time } from '@views/utils/date-formatting.js'
import ProviderLogo from '@views/components/primitives/ProviderLogo.js'
import CompactTimelineEvent from './CompactTimelineEvent.js'
import { thread_prompt_actions } from '@core/thread-prompt/index.js'
import { threads_actions } from '@core/threads/actions.js'

const ActiveSessionCard = ({ session }) => {
  const navigate = useNavigate()
  const dispatch = useDispatch()

  const handle_click = (event) => {
    if (!session.thread_id) return

    // Cmd+click (Mac) or Ctrl+click (Windows/Linux) opens in new tab
    if (event.metaKey || event.ctrlKey) {
      window.open(`/thread/${session.thread_id}`, '_blank')
    } else {
      navigate(`/thread/${session.thread_id}`)
    }
  }

  const handle_archive_click = (event) => {
    event.stopPropagation()
    if (session.thread_id) {
      dispatch(
        threads_actions.set_thread_archive_state({
          thread_id: session.thread_id,
          archive_reason: 'completed'
        })
      )
    }
  }

  const handle_message_click = (event) => {
    event.stopPropagation()
    if (session.thread_id) {
      dispatch(
        thread_prompt_actions.open({
          thread_id: session.thread_id,
          mode: 'resume'
        })
      )
    }
  }

  const working_directory_path = session.working_directory
  const working_directory = working_directory_path
    ? working_directory_path.split('/').pop() || 'root'
    : 'Unknown'

  // Use thread title if available, otherwise fall back to directory
  const display_title = session.thread_title || working_directory

  const last_activity = session.last_activity_at
    ? format_shorthand_time(session.last_activity_at)
    : 'just now'

  const status = session.status || 'active'
  const is_idle = status === 'idle'
  const has_thread = Boolean(session.thread_id)
  const is_redacted = Boolean(session.is_redacted)

  // Only show actions if idle, has thread, and user has permission (not redacted)
  const show_actions = is_idle && has_thread && !is_redacted

  const get_status_label = () => {
    if (is_idle) return 'Idle'
    return 'Active'
  }

  return (
    <div
      className={`active-session-card ${has_thread ? 'active-session-card--clickable' : ''}`}
      onClick={has_thread ? handle_click : undefined}>
      <div className='active-session-card__main-row'>
        <span
          className={`active-session-card__dot ${is_idle ? 'active-session-card__dot--idle' : ''}`}
        />
        <span className='active-session-card__title'>{display_title}</span>
        <span className='active-session-card__provider'>
          <ProviderLogo
            provider='claude'
            size={16}
            className='active-session-card__provider-logo'
            title='Claude Code'
            decorative={false}
          />
        </span>
      </div>

      <div className='active-session-card__details-row'>
        <span className='active-session-card__status'>
          {get_status_label()}
        </span>
        <span className='active-session-card__separator'>-</span>
        <span className='active-session-card__time'>{last_activity}</span>
      </div>

      {session.latest_timeline_event && (
        <CompactTimelineEvent timeline_event={session.latest_timeline_event} />
      )}

      {show_actions && (
        <div className='active-session-card__actions'>
          <button
            className='active-session-card__action-button'
            onClick={handle_message_click}
            title='Send message'
            aria-label='Send message to thread'>
            msg
          </button>
          <button
            className='active-session-card__action-button'
            onClick={handle_archive_click}
            title='Archive thread'
            aria-label='Archive thread'>
            archive
          </button>
        </div>
      )}
    </div>
  )
}

ActiveSessionCard.propTypes = {
  session: PropTypes.object.isRequired
}

export default ActiveSessionCard
