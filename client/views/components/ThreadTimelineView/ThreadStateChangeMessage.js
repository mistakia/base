import React from 'react'
import PropTypes from 'prop-types'
import ArchiveIcon from '@mui/icons-material/Archive'
import UnarchiveIcon from '@mui/icons-material/Unarchive'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'

import './ThreadStateChangeMessage.styl'

/**
 * Get icon component based on state transition
 */
const get_state_change_icon = (previous_state, new_state) => {
  const icon_props = {
    className: 'thread-state-change__icon',
    fontSize: 'small'
  }

  if (new_state === 'archived') {
    return <ArchiveIcon {...icon_props} />
  }

  if (previous_state === 'archived' && new_state === 'active') {
    return <UnarchiveIcon {...icon_props} />
  }

  return <SwapHorizIcon {...icon_props} />
}

/**
 * Format the reason for display
 */
const format_reason = (reason) => {
  if (!reason) return null

  // Convert snake_case or kebab-case to readable format
  return reason.replace(/[_-]/g, ' ')
}

/**
 * Get human-readable label for state
 */
const format_state = (state) => {
  if (!state) return 'unknown'
  return state.replace(/[_-]/g, ' ')
}

const ThreadStateChangeMessage = ({ event }) => {
  const previous_state = event.previous_thread_state
  const new_state = event.new_thread_state
  const reason = event.reason

  const formatted_reason = format_reason(reason)

  return (
    <div className='thread-state-change'>
      {get_state_change_icon(previous_state, new_state)}
      <div className='thread-state-change__content'>
        <span className='thread-state-change__label'>
          Thread state changed from{' '}
          <span className='thread-state-change__state'>
            {format_state(previous_state)}
          </span>{' '}
          to{' '}
          <span className='thread-state-change__state'>
            {format_state(new_state)}
          </span>
        </span>
        {formatted_reason && (
          <span className='thread-state-change__reason'>
            Reason: {formatted_reason}
          </span>
        )}
      </div>
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
