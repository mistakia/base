import React, { useState, useEffect, useRef } from 'react'
import PropTypes from 'prop-types'

import { get_spinner_verb } from '@core/utils/spinner-verbs.mjs'
import { format_shorthand_number } from '@views/utils/date-formatting.js'
import './SessionActivityBar.styl'

/**
 * Format elapsed seconds into a compact time string.
 * e.g. 65 -> "1m 5s", 3661 -> "1h 1m"
 */
const format_elapsed = (seconds) => {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remaining_seconds = seconds % 60
  if (minutes < 60) return `${minutes}m ${remaining_seconds}s`
  const hours = Math.floor(minutes / 60)
  const remaining_minutes = minutes % 60
  return `${hours}h ${remaining_minutes}m`
}

/**
 * Claude Code-style activity indicator for live sessions.
 * Shows spinner verb + elapsed time + token count for active sessions,
 * "Waiting for input" for idle sessions, and queue position for queued sessions.
 *
 * @param {Object} props
 * @param {Object} props.active_session - Session object with status, started_at, total_tokens, session_id
 * @param {boolean} [props.compact] - Render in compact mode for session cards
 */
const SessionActivityBar = ({ active_session, compact = false }) => {
  const [elapsed_seconds, set_elapsed_seconds] = useState(0)
  const [verb_tick, set_verb_tick] = useState(0)
  const last_status_ref = useRef(null)

  // 1-second timer for elapsed time
  useEffect(() => {
    if (!active_session) return

    const started_at = active_session.started_at || active_session.created_at
    if (!started_at) return

    const update_elapsed = () => {
      const elapsed = Math.floor(
        (Date.now() - new Date(started_at).getTime()) / 1000
      )
      set_elapsed_seconds(Math.max(0, elapsed))
    }

    update_elapsed()
    const interval = setInterval(update_elapsed, 1000)
    return () => clearInterval(interval)
  }, [active_session?.started_at, active_session?.created_at])

  // Rotate spinner verb when session status updates
  useEffect(() => {
    if (!active_session) return
    const status = active_session.status
    if (
      status === 'active' &&
      last_status_ref.current === 'active' &&
      active_session.last_activity_at
    ) {
      set_verb_tick((t) => t + 1)
    }
    last_status_ref.current = status
  }, [active_session?.last_activity_at, active_session?.status])

  if (!active_session) return null

  const { status, session_id, total_tokens } = active_session

  const bar_classes = [
    'session-activity-bar',
    compact ? 'session-activity-bar--compact' : '',
    `session-activity-bar--${status || 'active'}`
  ]
    .filter(Boolean)
    .join(' ')

  if (status === 'active') {
    const verb = get_spinner_verb(session_id, verb_tick)
    const elapsed_str = format_elapsed(elapsed_seconds)
    const tokens_str =
      total_tokens != null
        ? ` | ${format_shorthand_number(total_tokens)} tokens`
        : ''

    if (compact) {
      return (
        <span className={bar_classes}>
          {verb}... ({elapsed_str})
        </span>
      )
    }

    return (
      <div className={bar_classes}>
        <span className='session-activity-bar__dot' />
        <span className='session-activity-bar__text'>
          {verb}... ({elapsed_str}
          {tokens_str})
        </span>
      </div>
    )
  }

  if (status === 'idle') {
    const elapsed_str = format_elapsed(elapsed_seconds)

    if (compact) {
      return <span className={bar_classes}>Waiting ({elapsed_str})</span>
    }

    return (
      <div className={bar_classes}>
        <span className='session-activity-bar__dot' />
        <span className='session-activity-bar__text'>
          Waiting for input ({elapsed_str})
        </span>
      </div>
    )
  }

  if (status === 'pending' || status === 'queued') {
    if (compact) {
      return <span className={bar_classes}>Queued</span>
    }

    return (
      <div className={bar_classes}>
        <span className='session-activity-bar__dot' />
        <span className='session-activity-bar__text'>Queued</span>
      </div>
    )
  }

  return null
}

SessionActivityBar.propTypes = {
  active_session: PropTypes.shape({
    session_id: PropTypes.string,
    status: PropTypes.string,
    started_at: PropTypes.string,
    created_at: PropTypes.string,
    last_activity_at: PropTypes.string,
    total_tokens: PropTypes.number
  }),
  compact: PropTypes.bool
}

export default SessionActivityBar
