import React, { useState } from 'react'
import PropTypes from 'prop-types'
import { Box, Typography } from '@mui/material'

const CollapsibleEventGroup = ({
  events,
  renderEvent,
  hideTimelineDot,
  hideTimelineLine
}) => {
  const [expanded, set_expanded] = useState(false)

  const handle_expand = () => {
    set_expanded(true)
  }

  const calculate_visible_event_count = () => {
    return events.reduce((total_count, timeline_entry) => {
      if (timeline_entry.type === 'tool_pair') {
        return total_count + 1
      }
      return total_count + 1
    }, 0)
  }

  const visible_event_count = calculate_visible_event_count()

  if (expanded) {
    return (
      <Box className='collapsible-event-group expanded'>
        {events.map((entry, index) =>
          renderEvent(entry, index, hideTimelineDot, hideTimelineLine)
        )}
      </Box>
    )
  }

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
          show {visible_event_count} hidden{' '}
          {visible_event_count === 1 ? 'event' : 'events'}
        </Typography>
      </Box>
    </Box>
  )
}

CollapsibleEventGroup.propTypes = {
  events: PropTypes.array.isRequired,
  renderEvent: PropTypes.func.isRequired,
  hideTimelineDot: PropTypes.bool,
  hideTimelineLine: PropTypes.bool
}

export default CollapsibleEventGroup
