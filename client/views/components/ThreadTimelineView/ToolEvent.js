import React from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'
import { COLORS } from '@theme/colors.js'

import { getToolComponent } from './ToolComponents/index'

const ToolEvent = ({
  tool_call_event,
  tool_result_event,
  timeline,
  render_nested_timeline
}) => {
  if (!tool_call_event || tool_call_event.type !== 'tool_call') {
    return null
  }

  const tool_name = tool_call_event.content?.tool_name

  if (!tool_name) {
    return (
      <Box className='tool-event tool-use'>
        <span style={{ fontSize: '14px', color: COLORS.error }}>
          Unknown tool call - missing tool_name
        </span>
      </Box>
    )
  }

  const ToolComponent = getToolComponent(tool_name)

  return (
    <ToolComponent
      tool_call_event={tool_call_event}
      tool_result_event={tool_result_event}
      timeline={timeline}
      render_nested_timeline={render_nested_timeline}
    />
  )
}

ToolEvent.propTypes = {
  tool_call_event: PropTypes.shape({
    id: PropTypes.string.isRequired,
    timestamp: PropTypes.string.isRequired,
    type: PropTypes.oneOf(['tool_call']).isRequired,
    content: PropTypes.shape({
      tool_name: PropTypes.string.isRequired,
      tool_parameters: PropTypes.object,
      tool_call_id: PropTypes.string.isRequired,
      execution_status: PropTypes.string
    }).isRequired,
    session_provider: PropTypes.string,
    provider_data: PropTypes.object,
    ordering: PropTypes.object,
    metadata: PropTypes.object
  }).isRequired,
  tool_result_event: PropTypes.shape({
    id: PropTypes.string.isRequired,
    timestamp: PropTypes.string.isRequired,
    type: PropTypes.oneOf(['tool_result']).isRequired,
    content: PropTypes.shape({
      tool_call_id: PropTypes.string.isRequired,
      result: PropTypes.string,
      error: PropTypes.string
    }).isRequired,
    session_provider: PropTypes.string,
    provider_data: PropTypes.object,
    ordering: PropTypes.object,
    metadata: PropTypes.object
  }),
  timeline: PropTypes.array,
  render_nested_timeline: PropTypes.func
}

export default ToolEvent
