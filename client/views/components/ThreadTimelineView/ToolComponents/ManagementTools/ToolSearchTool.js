import React from 'react'
import PropTypes from 'prop-types'

import BaseToolComponent from '@views/components/ThreadTimelineView/ToolComponents/BaseToolComponent'

const ToolSearchTool = ({ tool_call_event }) => {
  const params = tool_call_event?.content?.tool_parameters || {}
  const query = params.query || ''
  const title = `ToolSearch(query="${query}")`

  return (
    <BaseToolComponent
      tool_call_event={tool_call_event}
      title_override={title}
      action_button={null}
    />
  )
}

ToolSearchTool.propTypes = {
  tool_call_event: PropTypes.object.isRequired
}

export default ToolSearchTool
