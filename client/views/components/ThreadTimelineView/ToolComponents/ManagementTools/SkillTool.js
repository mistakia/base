import React from 'react'
import PropTypes from 'prop-types'

import BaseToolComponent from '@views/components/ThreadTimelineView/ToolComponents/BaseToolComponent'

const SkillTool = ({ tool_call_event }) => {
  const params = tool_call_event?.content?.tool_parameters || {}
  const skill = params.skill || 'unknown'
  const args = params.args
  const title = args
    ? `Skill(skill="${skill}", args="${args}")`
    : `Skill(skill="${skill}")`

  return (
    <BaseToolComponent
      tool_call_event={tool_call_event}
      title_override={title}
      action_button={null}
    />
  )
}

SkillTool.propTypes = {
  tool_call_event: PropTypes.object.isRequired
}

export default SkillTool
