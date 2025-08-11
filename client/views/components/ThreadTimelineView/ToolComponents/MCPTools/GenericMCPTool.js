import React, { useState } from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'
import { Extension as MCPIcon } from '@mui/icons-material'
import BaseToolComponent from '../BaseToolComponent'
import { MonospaceText } from '@views/components/primitives/styled'
import { build_dual_tone_header } from '../shared/title-utils.js'
import CodeViewer from '@views/components/primitives/CodeViewer.js'

const GenericMCPTool = ({ tool_call_event, tool_result_event }) => {
  const [show_result, set_show_result] = useState(false)

  const get_mcp_info = () => {
    const tool_name = tool_call_event?.content?.tool_name || 'MCP Tool'
    const params = tool_call_event?.content?.tool_parameters || {}

    // Parse MCP tool name: mcp__<service>__<operation>
    const mcp_match = tool_name.match(/^mcp__([^_]+(?:_[^_]+)*)__(.+)$/)
    let service = 'unknown'
    let operation = 'action'

    if (mcp_match) {
      service = mcp_match[1].replace(/_/g, '-')
      operation = mcp_match[2].replace(/_/g, ' ')
    } else if (tool_name.startsWith('mcp__')) {
      // Fallback parsing
      const parts = tool_name.split('__')
      if (parts.length >= 2) {
        service = parts[1]
      }
      if (parts.length >= 3) {
        operation = parts.slice(2).join(' ').replace(/_/g, ' ')
      }
    }

    return { tool_name, service, operation, params }
  }

  const render_parameters_container = () => {
    const { params } = get_mcp_info()
    if (!show_result || Object.keys(params).length === 0) return null

    return (
      <Box sx={{ mb: 2 }}>
        <MonospaceText
          variant='xs'
          sx={{ display: 'block', mb: 1, fontWeight: 'bold' }}>
          Parameters:
        </MonospaceText>
        <Box
          sx={{
            border: '1px solid',
            borderColor: 'grey.300',
            borderRadius: 1,
            overflow: 'hidden'
          }}>
          <CodeViewer code={JSON.stringify(params, null, 2)} language='json' />
        </Box>
      </Box>
    )
  }

  const render_mcp_result = () => {
    if (!show_result || !tool_result_event) return null

    const result = tool_result_event?.content?.result

    let code = ''
    let language = 'text'

    if (typeof result === 'string') {
      code = result
      // naive json detection
      try {
        const parsed = JSON.parse(result)
        code = JSON.stringify(parsed, null, 2)
        language = 'json'
      } catch (e) {
        language = 'text'
      }
    } else {
      code = JSON.stringify(result, null, 2)
      language = 'json'
    }

    return (
      <Box>
        <MonospaceText
          variant='xs'
          sx={{ display: 'block', mb: 1, fontWeight: 'bold' }}>
          Result:
        </MonospaceText>
        <Box
          sx={{
            border: '1px solid',
            borderColor: 'grey.300',
            borderRadius: 1,
            overflow: 'hidden'
          }}>
          <CodeViewer code={code} language={language} />
        </Box>
      </Box>
    )
  }

  const { service, operation } = get_mcp_info()

  const has_any_content = (() => {
    const { params } = get_mcp_info()
    const has_params = Object.keys(params).length > 0
    const has_result = Boolean(
      tool_result_event &&
        tool_result_event.content &&
        'result' in tool_result_event.content
    )
    return has_params || has_result
  })()

  const header_node = build_dual_tone_header({
    left_label: service,
    right_label: operation,
    action_button: has_any_content
      ? {
          label: show_result ? 'hide result' : 'show result',
          onClick: () => set_show_result(!show_result)
        }
      : null
  })

  return (
    <BaseToolComponent
      tool_call_event={tool_call_event}
      icon={<MCPIcon fontSize='small' />}
      header={header_node}>
      {render_parameters_container()}
      {render_mcp_result()}
    </BaseToolComponent>
  )
}

GenericMCPTool.propTypes = {
  tool_call_event: PropTypes.object.isRequired,
  tool_result_event: PropTypes.object
}

export default GenericMCPTool
