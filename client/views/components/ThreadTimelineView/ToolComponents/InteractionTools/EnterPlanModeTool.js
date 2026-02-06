import React from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'

import BaseToolComponent from '@components/ThreadTimelineView/ToolComponents/BaseToolComponent'
import { MonospaceText } from '@components/primitives/styled'
import { build_dual_tone_header } from '@components/ThreadTimelineView/ToolComponents/shared/title-utils'

import './InteractionTools.styl'

const EnterPlanModeTool = ({ tool_call_event, tool_result_event }) => {
  const has_error = Boolean(tool_result_event?.content?.error)

  const header_node = build_dual_tone_header({
    left_label: 'Enter Plan Mode',
    right_label: has_error ? 'Failed' : 'Entered'
  })

  return (
    <BaseToolComponent tool_call_event={tool_call_event} header={header_node}>
      <Box className='plan-mode-indicator'>
        <Box
          component='span'
          className={`status-dot ${has_error ? 'status-dot--error' : 'status-dot--info'}`}
        />
        <MonospaceText variant='xs' className='plan-mode-indicator__text'>
          {has_error ? 'Plan mode entry failed' : 'Entered Plan Mode'}
        </MonospaceText>
      </Box>
    </BaseToolComponent>
  )
}

EnterPlanModeTool.propTypes = {
  tool_call_event: PropTypes.object.isRequired,
  tool_result_event: PropTypes.object
}

export default EnterPlanModeTool
