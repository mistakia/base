import React from 'react'
import PropTypes from 'prop-types'

import BaseToolComponent from '@views/components/ThreadTimelineView/ToolComponents/BaseToolComponent'

const KillShellTool = ({ tool_call_event }) => {
  const title = 'KillShell()'

  return (
    <BaseToolComponent
      tool_call_event={tool_call_event}
      title_override={title}
      action_button={null}
    />
  )
}

KillShellTool.propTypes = {
  tool_call_event: PropTypes.object.isRequired
}

export default KillShellTool
