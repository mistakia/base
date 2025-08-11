import React, { useState } from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'
import BaseToolComponent from '../BaseToolComponent'
import { MonospaceText } from '@views/components/primitives/styled'
import { build_dual_tone_header } from '../shared/title-utils.js'

const BrowserTool = ({ tool_call_event, tool_result_event }) => {
  const [show_result, set_show_result] = useState(false)

  const get_browser_info = () => {
    const params = tool_call_event?.content?.tool_parameters || {}
    const tool_name = tool_call_event?.content?.tool_name || 'Browser'

    // Extract action from MCP tool name
    const action_match = tool_name.match(/mcp__playwright__browser_(\w+)/)
    const action = action_match ? action_match[1] : 'action'

    return {
      action,
      params,
      tool_name
    }
  }

  const get_browser_result = () => {
    if (!tool_result_event?.content?.result) return null

    const result = tool_result_event.content.result
    let result_text = ''

    if (Array.isArray(result) && result[0]?.text) {
      result_text = result[0].text
    } else if (typeof result === 'string') {
      result_text = result
    } else {
      result_text = JSON.stringify(result, null, 2)
    }

    return result_text
  }

  const get_header_labels = () => {
    const { action, params } = get_browser_info()

    switch (action) {
      case 'navigate':
        return {
          left_label: 'View',
          right_label: params.url || ''
        }
      case 'click':
        return {
          left_label: 'Click',
          right_label: params.element || 'element'
        }
      case 'type':
        return {
          left_label: 'Type',
          right_label:
            `"${params.text || ''}"` +
            (params.element ? ` into ${params.element}` : '')
        }
      case 'hover':
        return {
          left_label: 'Hover',
          right_label: params.element || 'element'
        }
      case 'wait_for': {
        const wait_time = params.time
        const wait_text = params.text
        if (wait_time) {
          return {
            left_label: 'Wait',
            right_label: `${wait_time} seconds`
          }
        } else if (wait_text) {
          return {
            left_label: 'Wait for',
            right_label: `"${wait_text}"`
          }
        }
        return {
          left_label: 'Wait',
          right_label: 'for condition'
        }
      }
      case 'console_messages':
        return {
          left_label: 'Read',
          right_label: 'console messages'
        }
      case 'network_requests':
        return {
          left_label: 'Read',
          right_label: 'network requests'
        }
      case 'take_screenshot':
      case 'screenshot':
        return {
          left_label: 'Take',
          right_label: 'screenshot'
        }
      case 'evaluate':
        return {
          left_label: 'Evaluate',
          right_label: 'JavaScript'
        }
      case 'press_key':
        return {
          left_label: 'Press',
          right_label: params.key || 'key'
        }
      case 'snapshot':
        return {
          left_label: 'Capture',
          right_label: 'accessibility snapshot'
        }
      default:
        return {
          left_label: 'Browser',
          right_label: action.replace(/_/g, ' ')
        }
    }
  }

  const render_parameters = () => {
    const { action, params } = get_browser_info()

    // Don't show parameters for simple actions that are already in the header
    if (['console_messages', 'network_requests', 'snapshot'].includes(action)) {
      return null
    }

    const relevant_params = Object.entries(params).filter(([key, value]) => {
      // Filter out empty values and already displayed params
      if (
        !value ||
        value === '' ||
        (Array.isArray(value) && value.length === 0)
      )
        return false

      // Skip params already shown in header
      if (action === 'navigate' && key === 'url') return false
      if (action === 'type' && (key === 'text' || key === 'element'))
        return false
      if (action === 'wait_for' && (key === 'time' || key === 'text'))
        return false
      if ((action === 'click' || action === 'hover') && key === 'element')
        return false
      if (action === 'press_key' && key === 'key') return false

      return true
    })

    if (relevant_params.length === 0) return null

    return (
      <Box sx={{ mb: 2 }}>
        {relevant_params.map(([key, value]) => (
          <Box key={key} sx={{ mb: 1 }}>
            <MonospaceText variant='xs' sx={{ fontWeight: 'bold', mr: 1 }}>
              {key}:
            </MonospaceText>
            <MonospaceText variant='xs'>
              {Array.isArray(value) ? value.join(', ') : String(value)}
            </MonospaceText>
          </Box>
        ))}
      </Box>
    )
  }

  const render_browser_result = () => {
    const result_text = get_browser_result()
    if (!result_text || !show_result) return null

    return (
      <Box sx={{ mt: 2 }}>
        <Box
          sx={{
            bgcolor: 'grey.50',
            border: '1px solid',
            borderColor: 'grey.200',
            borderRadius: 1,
            maxHeight: '300px',
            overflow: 'auto'
          }}>
          <MonospaceText
            variant='xs'
            component='pre'
            sx={{
              m: 0,
              p: 1.5,
              whiteSpace: 'pre-wrap',
              color: 'text.primary',
              lineHeight: 1.4
            }}>
            {result_text}
          </MonospaceText>
        </Box>
      </Box>
    )
  }

  const { left_label, right_label } = get_header_labels()
  const result_text = get_browser_result()

  const action_button = result_text
    ? {
        label: show_result ? 'hide result' : 'show result',
        onClick: () => set_show_result(!show_result)
      }
    : null

  return (
    <BaseToolComponent tool_call_event={tool_call_event} show_header={false}>
      {build_dual_tone_header({
        left_label,
        right_label,
        action_button
      })}

      {render_parameters()}
      {render_browser_result()}
    </BaseToolComponent>
  )
}

BrowserTool.propTypes = {
  tool_call_event: PropTypes.object.isRequired,
  tool_result_event: PropTypes.object
}

export default BrowserTool
