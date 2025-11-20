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
  hideTimelineDot,
  hideTimelineLine,
  mode = 'notable_events', // 'default' | 'notable_events'
  onExpand = null // Callback for mode="default" to switch to notable events view
}) => {
  const [expanded, set_expanded] = useState(false)

  const handle_expand = () => {
    if (mode === 'default' && onExpand) {
      // Default mode: switch to notable events view
      onExpand()
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
        {events.map((entry, index) =>
          renderEvent(entry, index, hideTimelineDot, hideTimelineLine)
        )}
      </Box>
    )
  }

  // Determine collapsed button text based on mode
  const collapsed_text =
    mode === 'default'
      ? 'show hidden events'
      : `show ${event_count} hidden ${event_count === 1 ? 'event' : 'events'}`

  return (
    <Box className='collapsible-event-group'>
      <Box
        className='collapsed-container'
        onClick={handle_expand}
        sx={{
          border: '1px solid var(--color-border)',
          borderRadius: 1,
          padding: '4px 16px',
          margin: '16px 0',
          fontSize: 'var(--font-size-sm)',
          cursor: 'pointer',
          backgroundColor: 'var(--color-surface)',
          position: 'relative',
          transition: 'background-color 0.2s',
          '&:hover': {
            backgroundColor: 'var(--color-surface-hover)'
          }
        }}>
        <Typography
          className='collapsed-text'
          variant='body2'
          sx={{
            textAlign: 'center',
            color: 'var(--color-text-secondary)',
            fontSize: '0.875rem'
          }}>
          {collapsed_text}
        </Typography>
      </Box>
    </Box>
  )
}

CollapsibleEventGroup.propTypes = {
  events: PropTypes.array.isRequired,
  renderEvent: PropTypes.func.isRequired,
  hideTimelineDot: PropTypes.bool,
  hideTimelineLine: PropTypes.bool,
  mode: PropTypes.oneOf(['default', 'notable_events']),
  onExpand: PropTypes.func
}

export default CollapsibleEventGroup
