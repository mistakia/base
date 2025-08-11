import React from 'react'
import PropTypes from 'prop-types'
import MultiEditTool from './MultiEditTool'

// Compatibility wrapper: maps single-edit params to MultiEditTool's edits array
const EditTool = ({ tool_call_event, tool_result_event }) => {
  const params = tool_call_event?.content?.tool_parameters || {}
  const old_string = params.old_string || ''
  const new_string = params.new_string || ''

  const normalized_tool_call_event = {
    ...tool_call_event,
    content: {
      ...tool_call_event?.content,
      tool_parameters: {
        ...params,
        edits: [
          {
            old_string,
            new_string
          }
        ]
      }
    }
  }

  return (
    <MultiEditTool
      tool_call_event={normalized_tool_call_event}
      tool_result_event={tool_result_event}
    />
  )
}

EditTool.propTypes = {
  tool_call_event: PropTypes.object.isRequired,
  tool_result_event: PropTypes.object
}

export default EditTool
