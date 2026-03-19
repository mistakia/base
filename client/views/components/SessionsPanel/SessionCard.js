import React, { useCallback } from 'react'
import PropTypes from 'prop-types'
import { useDispatch } from 'react-redux'

import {
  format_shorthand_time,
  format_shorthand_number
} from '@views/utils/date-formatting.js'
import CompactTimelineEvent from './CompactTimelineEvent.js'
import SessionActivityBar from '@views/components/SessionActivityBar/SessionActivityBar.js'
import { thread_prompt_actions } from '@core/thread-prompt/index.js'
import { threads_actions } from '@core/threads/actions.js'
import { thread_sheet_actions } from '@core/thread-sheet/index.js'
import { use_discard_confirm } from '@views/hooks/use-discard-confirm.js'

/**
 * Unified card component for displaying both active sessions and threads.
 * Renders identical UI for visual consistency across homepage sections.
 *
 * @param {Object} props
 * @param {Object} props.item - Normalized session/thread data
 * @param {string} props.item.id - Thread ID for navigation
 * @param {string} props.item.title - Display title
 * @param {string} props.item.status - Status: 'running' | 'idle' | 'review' | 'archived'
 * @param {string} props.item.updated_at - ISO timestamp for last activity
 * @param {string} [props.item.working_directory] - Working directory path
 * @param {number} [props.item.message_count] - Number of messages
 * @param {number} [props.item.duration_minutes] - Duration in minutes
 * @param {number} [props.item.total_tokens] - Total token count
 * @param {Object} [props.item.latest_timeline_event] - Latest timeline event
 * @param {boolean} [props.item.show_actions] - Whether to show action buttons
 */
const SessionCard = ({ item }) => {
  const dispatch = useDispatch()

  const abandoned_callback = useCallback(() => {
    if (item.id) {
      dispatch(
        threads_actions.set_thread_archive_state({
          thread_id: item.id,
          archive_reason: 'user_abandoned'
        })
      )
    }
  }, [dispatch, item.id])

  const { is_confirming: is_abandoned_confirming, handle_discard_click } =
    use_discard_confirm({ on_discard: abandoned_callback })

  const handle_click = (event) => {
    if (item.id) {
      // Cmd+click (Mac) or Ctrl+click (Windows/Linux) opens in new tab
      if (event.metaKey || event.ctrlKey) {
        window.open(`/thread/${item.id}`, '_blank')
      } else {
        dispatch(thread_sheet_actions.open_thread_sheet({ thread_id: item.id }))
      }
    } else if (item.session_id) {
      dispatch(
        thread_sheet_actions.open_session_sheet({
          session_id: item.session_id
        })
      )
    }
  }

  const handle_archive_click = (event) => {
    event.stopPropagation()
    if (item.id) {
      dispatch(
        threads_actions.set_thread_archive_state({
          thread_id: item.id,
          archive_reason: 'completed'
        })
      )
    }
  }

  const handle_message_click = (event) => {
    event.stopPropagation()
    if (item.id) {
      dispatch(
        thread_prompt_actions.open({
          thread_id: item.id,
          thread_user_public_key: item.user_public_key
        })
      )
    }
  }

  const handle_abandoned_click = (event) => {
    event.stopPropagation()
    handle_discard_click()
  }

  const created_time = item.created_at
    ? format_shorthand_time(item.created_at)
    : null

  const updated_time = item.updated_at
    ? format_shorthand_time(item.updated_at)
    : 'just now'

  const working_directory = item.working_directory
    ? item.working_directory.split('/').pop() || 'root'
    : null

  const duration = item.duration_minutes
    ? `${parseFloat(item.duration_minutes.toFixed(1))}m`
    : null

  const card_classes = [
    'session-card',
    item.status === 'running' ? 'session-card--running' : '',
    item.status === 'ended' ? 'session-card--ended' : '',
    item.id || item.session_id ? 'session-card--clickable' : '',
    item.is_other_user ? 'session-card--other-user' : ''
  ]
    .filter(Boolean)
    .join(' ')

  // Check if we have any details to show
  const has_details =
    working_directory ||
    item.message_count != null ||
    duration ||
    item.total_tokens != null

  // Show footer row if we have details or actions
  const show_footer = has_details || item.show_actions

  return (
    <div
      className={card_classes}
      onClick={item.id || item.session_id ? handle_click : undefined}>
      <div className='session-card__main-row'>
        <span className='session-card__title'>{item.title || '-'}</span>
        <span className='session-card__time'>
          {created_time && created_time !== updated_time ? (
            <>
              <span className='session-card__time-updated' title='Updated'>
                {updated_time}
              </span>
              <span className='session-card__time-separator'>/</span>
              <span className='session-card__time-created' title='Created'>
                {created_time}
              </span>
            </>
          ) : (
            updated_time
          )}
        </span>
      </div>

      {(item.status === 'running' || item.status === 'idle') ? (
        <SessionActivityBar
          active_session={{
            session_id: item.session_id,
            status: item.status === 'running' ? 'active' : 'idle',
            started_at: item.created_at,
            last_activity_at: item.updated_at,
            total_tokens: item.total_tokens
          }}
          compact
        />
      ) : item.latest_timeline_event ? (
        <CompactTimelineEvent
          timeline_event={item.latest_timeline_event}
          thread_id={item.id}
        />
      ) : null}

      {show_footer && (
        <div className='session-card__footer'>
          <div className='session-card__details'>
            {working_directory && (
              <>
                <span className='session-card__directory'>
                  {working_directory}
                </span>
                {(item.message_count != null ||
                  duration ||
                  item.total_tokens != null) && (
                  <span className='session-card__separator'>•</span>
                )}
              </>
            )}
            {item.message_count != null && (
              <>
                <span className='session-card__stat'>
                  {item.message_count} msg{item.message_count !== 1 ? 's' : ''}
                </span>
                {(duration || item.total_tokens != null) && (
                  <span className='session-card__separator'>•</span>
                )}
              </>
            )}
            {duration && (
              <>
                <span className='session-card__stat'>{duration}</span>
                {item.total_tokens != null && (
                  <span className='session-card__separator'>•</span>
                )}
              </>
            )}
            {item.total_tokens != null && (
              <span className='session-card__stat'>
                {format_shorthand_number(item.total_tokens)} tokens
              </span>
            )}
          </div>
          {item.show_actions && (
            <div className='session-card__actions'>
              <button
                className='session-card__action-button'
                onClick={handle_message_click}
                title='Send message'
                aria-label='Send message to thread'>
                msg
              </button>
              <button
                className={`session-card__action-button session-card__action-button--danger${is_abandoned_confirming ? ' session-card__action-button--confirming' : ''}`}
                onClick={handle_abandoned_click}
                title={
                  is_abandoned_confirming
                    ? 'Click again to confirm abandon'
                    : 'Abandon thread'
                }
                aria-label={
                  is_abandoned_confirming
                    ? 'Click again to confirm abandon'
                    : 'Abandon thread'
                }>
                {is_abandoned_confirming ? 'confirm' : 'abandon'}
              </button>
              <button
                className='session-card__action-button'
                onClick={handle_archive_click}
                title='Archive thread'
                aria-label='Archive thread'>
                archive
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

SessionCard.propTypes = {
  item: PropTypes.shape({
    id: PropTypes.string,
    session_id: PropTypes.string,
    title: PropTypes.string,
    status: PropTypes.oneOf(['running', 'idle', 'review', 'archived', 'ended']),
    created_at: PropTypes.string,
    updated_at: PropTypes.string,
    working_directory: PropTypes.string,
    message_count: PropTypes.number,
    duration_minutes: PropTypes.number,
    total_tokens: PropTypes.number,
    latest_timeline_event: PropTypes.object,
    user_public_key: PropTypes.string,
    is_other_user: PropTypes.bool,
    show_actions: PropTypes.bool
  }).isRequired
}

export default SessionCard
