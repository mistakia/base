import React, { useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'

import {
  LIFECYCLE_STATUSES,
  STATUS_LABEL,
  STATUS_GLYPH,
  STATUS_COLOR_TOKEN,
  STATUS_SHOWS_SPINNER,
  BRAILLE_SPINNER_FRAMES,
  BRAILLE_SPINNER_FRAME_INTERVAL_MS,
  pick_active_verb
} from '#libs-shared/thread-lifecycle.mjs'

import './ThreadLifecycleIndicator.styl'

const css_var_for_token = (token) =>
  `var(--color-${token.replace(/_/g, '-')})`

const BrailleSpinner = () => {
  const [frame_index, set_frame_index] = useState(0)
  useEffect(() => {
    const id = setInterval(() => {
      set_frame_index((i) => (i + 1) % BRAILLE_SPINNER_FRAMES.length)
    }, BRAILLE_SPINNER_FRAME_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])
  return (
    <span className='thread-lifecycle-indicator__spinner' aria-hidden='true'>
      {BRAILLE_SPINNER_FRAMES[frame_index]}
    </span>
  )
}

const ThreadLifecycleIndicator = ({
  status,
  thread_id,
  user_message_count = 0,
  variant = 'inline'
}) => {
  const active_verb = useMemo(() => {
    if (status !== 'active') return null
    return pick_active_verb({
      thread_id: thread_id || '',
      turn_count: user_message_count || 0
    })
  }, [status, thread_id, user_message_count])

  if (!status || !LIFECYCLE_STATUSES.includes(status)) return null

  const color = css_var_for_token(STATUS_COLOR_TOKEN[status])
  const is_active = status === 'active'
  const shows_spinner = variant === 'footer' && STATUS_SHOWS_SPINNER[status]
  const glyph = is_active ? '\u203A' : STATUS_GLYPH[status]
  const label = is_active ? `${active_verb}...` : STATUS_LABEL[status]

  return (
    <span
      className={`thread-lifecycle-indicator thread-lifecycle-indicator--${variant}`}
      data-status={status}
      style={{ color }}
    >
      <span className='thread-lifecycle-indicator__glyph' aria-hidden='true'>
        {glyph}
      </span>
      {shows_spinner ? <BrailleSpinner /> : null}
      <span className='thread-lifecycle-indicator__label'>{label}</span>
    </span>
  )
}

ThreadLifecycleIndicator.propTypes = {
  status: PropTypes.oneOf([...LIFECYCLE_STATUSES, null]),
  thread_id: PropTypes.string,
  user_message_count: PropTypes.number,
  variant: PropTypes.oneOf(['footer', 'inline'])
}

export default ThreadLifecycleIndicator
