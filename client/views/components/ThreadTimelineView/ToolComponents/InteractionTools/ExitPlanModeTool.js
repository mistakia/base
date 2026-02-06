import React, { useState } from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'

import BaseToolComponent from '@components/ThreadTimelineView/ToolComponents/BaseToolComponent'
import { MonospaceText } from '@components/primitives/styled'
import { build_dual_tone_header } from '@components/ThreadTimelineView/ToolComponents/shared/title-utils'
import MarkdownViewer from '@components/primitives/MarkdownViewer'

import './InteractionTools.styl'

const ExitPlanModeTool = ({ tool_call_event, tool_result_event }) => {
  const [show_plan, set_show_plan] = useState(false)

  const get_plan_info = () => {
    const params = tool_call_event?.content?.tool_parameters || {}
    const plan = params.plan || ''
    return { plan }
  }

  const extract_plan_title = (plan_content) => {
    if (!plan_content) return 'Plan'

    // Try to extract title from first markdown heading
    const heading_match = plan_content.match(/^#\s+(.+)$/m)
    if (heading_match) {
      return heading_match[1].trim()
    }

    // Fallback: use first line if short enough
    const first_line = plan_content.split('\n')[0]?.trim()
    if (first_line && first_line.length <= 60) {
      return first_line
    }

    return 'Plan'
  }

  const get_status = () => {
    if (!tool_result_event) return { status: 'pending', text: 'Awaiting review' }

    const result = tool_result_event?.content?.result || ''
    const error = tool_result_event?.content?.error

    if (error) {
      return { status: 'rejected', text: 'Plan rejected' }
    }

    // Check result text for approval indicators
    const result_lower = result.toLowerCase()
    if (
      result_lower.includes("doesn't want to proceed") ||
      result_lower.includes('rejected') ||
      result_lower.includes('user said no')
    ) {
      return { status: 'rejected', text: 'Plan rejected' }
    }

    return { status: 'confirmed', text: 'Plan confirmed' }
  }

  const { plan } = get_plan_info()
  const title = extract_plan_title(plan)
  const { status, text: status_text } = get_status()

  const has_plan = Boolean(plan)
  const action_button = has_plan
    ? {
        label: show_plan ? 'hide plan' : 'show plan',
        onClick: () => set_show_plan(!show_plan)
      }
    : null

  const header_node = build_dual_tone_header({
    left_label: 'Exit Plan Mode',
    right_label: title,
    action_button
  })

  return (
    <BaseToolComponent
      tool_call_event={tool_call_event}
      header={header_node}>
      <Box className='plan-mode-indicator'>
        <Box
          component='span'
          className={`status-dot status-dot--${status}`}
        />
        <MonospaceText variant='xs' className='plan-mode-indicator__text'>
          {status_text}
        </MonospaceText>
      </Box>
      {show_plan && has_plan && (
        <Box className='plan-content'>
          <MarkdownViewer content={plan} />
        </Box>
      )}
    </BaseToolComponent>
  )
}

ExitPlanModeTool.propTypes = {
  tool_call_event: PropTypes.object.isRequired,
  tool_result_event: PropTypes.object
}

export default ExitPlanModeTool
