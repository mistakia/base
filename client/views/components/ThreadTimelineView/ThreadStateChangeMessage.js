import React from 'react'
import PropTypes from 'prop-types'

import './ThreadStateChangeMessage.styl'

/**
 * Format the reason for display
 */
const format_reason = (reason) => {
  if (!reason) return null

  // Convert snake_case or kebab-case to readable format
  return reason.replace(/[_-]/g, ' ')
}

const ThreadStateChangeMessage = ({ event }) => {
  const previous_state = event.previous_thread_state || 'unknown'
  const new_state = event.new_thread_state || 'unknown'
  const reason = event.reason

  const formatted_reason = format_reason(reason)

  return (
    <div className='thread-state-change'>
      <span className='thread-state-change__transition'>
        {previous_state} {'→'} {new_state}
      </span>
      {formatted_reason && (
        <span className='thread-state-change__reason'>{formatted_reason}</span>
      )}
    </div>
  )
}

ThreadStateChangeMessage.propTypes = {
  event: PropTypes.shape({
    previous_thread_state: PropTypes.string,
    new_thread_state: PropTypes.string,
    reason: PropTypes.string
  }).isRequired
}

export default ThreadStateChangeMessage
