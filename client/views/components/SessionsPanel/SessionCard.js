import React, { useCallback } from 'react'
import PropTypes from 'prop-types'
import { useDispatch } from 'react-redux'

import {
  format_shorthand_time,
  format_shorthand_number
} from '@views/utils/date-formatting.js'
import CompactTimelineEvent from './CompactTimelineEvent.js'
import ThreadLifecycleIndicator from '@views/components/ThreadLifecycleIndicator/ThreadLifecycleIndicator.js'
import { LIVE_STATUSES } from '#libs-shared/thread-lifecycle.mjs'
import { thread_prompt_actions } from '@core/thread-prompt/index.js'
import { threads_actions } from '@core/threads/actions.js'
import { thread_sheet_actions } from '@core/thread-sheet/index.js'
import { use_discard_confirm } from '@views/hooks/use-discard-confirm.js'

const LIVE_STATUS_SET = new Set(LIVE_STATUSES)

/**
 * Unified card component for displaying both active sessions and threads.
 * Renders identical UI for visual consistency across homepage sections.
 *
 * @param {Object} props
 * @param {Object} props.item - Normalized session/thread data with
 *   `session_status` and `thread_state` set directly from the canonical
 *   lifecycle model.
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

  const session_status = item.session_status || null
  const is_live = session_status && LIVE_STATUS_SET.has(session_status)

  const card_classes = [
    'session-card',
    item.id || item.session_id ? 'session-card--clickable' : '',
    item.is_other_user ? 'session-card--other-user' : ''
  ]
    .filter(Boolean)
    .join(' ')

  const has_details =
    working_directory ||
    item.message_count != null ||
    duration ||
    item.total_tokens != null

  const show_footer = has_details || item.show_actions || is_live

  return (
    <div
      className={card_classes}
      onClick={item.id || item.session_id ? handle_click : undefined}>
      <div className='session-card__main-row'>
        <span className='session-card__title'>{item.title || 'Untitled'}</span>
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

      {item.latest_timeline_event && !is_live && (
        <CompactTimelineEvent
          timeline_event={item.latest_timeline_event}
          thread_id={item.id}
        />
      )}

      {show_footer && (
        <div className='session-card__footer'>
          <div className='session-card__details'>
            {session_status && (
              <>
                <ThreadLifecycleIndicator
                  status={session_status}
                  thread_id={item.id || ''}
                  user_message_count={item.user_message_count || 0}
                  variant='inline'
                />
                {has_details && (
                  <span className='session-card__separator'>•</span>
                )}
              </>
            )}
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
    session_status: PropTypes.string,
    thread_state: PropTypes.string,
    user_message_count: PropTypes.number,
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
