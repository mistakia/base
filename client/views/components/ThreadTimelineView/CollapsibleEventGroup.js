import React, { useState } from 'react'
import PropTypes from 'prop-types'
import { Box, Typography } from '@mui/material'

/**
 * CollapsibleEventGroup
 *
 * Displays a collapsed group of timeline events with two modes:
 * - 'default': Button shows "show hidden events" and switches to notable events view
 * - 'notable_events': Button shows "show N hidden events" and expands inline
 */
const CollapsibleEventGroup = ({
  events,
  renderEvent,
  mode = 'notable_events', // 'default' | 'notable_events'
  onExpand = null // Callback for mode="default" to switch to notable events view
}) => {
  const [expanded, set_expanded] = useState(false)

  const handle_expand = () => {
    if (mode === 'default') {
      // Default mode: switch to notable events view (no-op if no callback)
      if (onExpand) {
        onExpand()
      }
    } else {
      // Notable events mode: expand this section inline
      set_expanded(true)
    }
  }

  const event_count = events.length

  // When expanded, render all events
  if (expanded) {
    return (
      <Box className='collapsible-event-group expanded'>
        {events.map((entry, index) => renderEvent(entry, index))}
      </Box>
    )
  }

  // Determine collapsed button text based on mode
  const collapsed_text =
    mode === 'default'
      ? 'show hidden events >'
      : `show ${event_count} hidden ${event_count === 1 ? 'event' : 'events'} >`

  return (
    <Box className='collapsible-event-group'>
      <Typography
        className='collapsed-text'
        component='div'
        onClick={handle_expand}
        sx={{
          display: 'block',
          padding: '8px 0',
          margin: '8px 0',
          cursor: 'pointer',
          color: 'var(--color-text-tertiary)',
          fontSize: '0.75rem',
          textAlign: 'left'
        }}>
        {collapsed_text}
      </Typography>
    </Box>
  )
}

CollapsibleEventGroup.propTypes = {
  events: PropTypes.array.isRequired,
  renderEvent: PropTypes.func.isRequired,
  mode: PropTypes.oneOf(['default', 'notable_events']),
  onExpand: PropTypes.func
}

export default CollapsibleEventGroup
