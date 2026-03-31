import React from 'react'
import PropTypes from 'prop-types'

import BaseToolComponent from '@views/components/ThreadTimelineView/ToolComponents/BaseToolComponent'

const SendMessageTool = ({ tool_call_event }) => {
  const params = tool_call_event?.content?.tool_parameters || {}
  const to = params.to || 'unknown'
  const title = `SendMessage(to="${to}")`

  return (
    <BaseToolComponent
      tool_call_event={tool_call_event}
      title_override={title}
      action_button={null}
    />
  )
}

SendMessageTool.propTypes = {
  tool_call_event: PropTypes.object.isRequired
}

export default SendMessageTool
