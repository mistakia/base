import React, { useState } from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'
import { Description as FileIcon } from '@mui/icons-material'
import BaseToolComponent from '@views/components/ThreadTimelineView/ToolComponents/BaseToolComponent'
import {
  MonospaceText,
  StatusText
} from '@views/components/primitives/styled/index.js'
import {
  build_dual_tone_header,
  format_relative_path
} from '@views/components/ThreadTimelineView/ToolComponents/shared/title-utils'
import { get_line_count } from '@views/components/ThreadTimelineView/ToolComponents/shared/result-utils'
import { use_context_working_directory } from '@views/components/ThreadTimelineView/ToolComponents/shared/use-context-working-directory'

const ReadTool = ({ tool_call_event, tool_result_event }) => {
  const [show_content, set_show_content] = useState(false)

  const get_file_info = () => {
    const file_path =
      tool_call_event?.content?.tool_parameters?.file_path || 'Unknown file'

    const file_name = file_path.split('/').pop()
    const file_ext = file_name?.split('.').pop()?.toLowerCase() || ''

    return { file_path, file_name, file_ext }
  }

  const parse_content_lines = (content) => {
    const raw_lines = content.split('\n')
    const uses_arrow = raw_lines.some((line) => /^\s*\d+\s*→/.test(line))

    if (!uses_arrow) {
      return raw_lines.map((text, index) => ({ line_number: index + 1, text }))
    }

    return raw_lines.map((line, index) => {
      const match = line.match(/^\s*(\d+)\s*→\s?(.*)$/)
      if (match) {
        const [, number_str, rest] = match
        const parsed_number = Number(number_str)
        return {
          line_number: Number.isNaN(parsed_number) ? index + 1 : parsed_number,
          text: rest
        }
      }
      return { line_number: index + 1, text: line }
    })
  }

  const render_file_content = () => {
    if (!tool_result_event) return null

    const content = tool_result_event?.content?.result || ''

    if (typeof content !== 'string') {
      return (
        <StatusText status='error' sx={{ fontStyle: 'italic' }}>
          Error reading file content
        </StatusText>
      )
    }

    const parsed_lines = parse_content_lines(content)
    const show_line_numbers = parsed_lines.length > 5
    const highlight_line_number = tool_result_event?.provider_data?.line_number

    return (
      <Box
        sx={{
          border: '1px solid var(--color-border)',
          borderRadius: 1,
          bgcolor: 'background.paper',
          maxHeight: '400px',
          overflow: 'hidden',
          mt: 1,
          boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)'
        }}>
        {/* Window-like header */}
        <Box
          sx={{
            bgcolor: 'grey.100',
            borderBottom: '1px solid var(--color-border)',
            px: 2,
            py: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 1
          }}>
          <MonospaceText
            variant='xs'
            sx={{ color: 'text.secondary', fontWeight: 500 }}>
            {get_file_info().file_name} ({parsed_lines.length} lines)
          </MonospaceText>
        </Box>

        {/* File content with scroll */}
        <Box
          sx={{
            maxHeight: '320px',
            overflowY: 'auto',
            p: 0
          }}>
          <Box
            component='pre'
            sx={{
              m: 0,
              p: 2,
              whiteSpace: 'pre-wrap',
              lineHeight: 1.4,
              fontSize: '12px'
            }}>
            {show_line_numbers ? (
              <table style={{ width: '100%', borderSpacing: 0 }}>
                <tbody>
                  {parsed_lines.map((parsed_line, index) => {
                    const is_highlighted =
                      typeof highlight_line_number === 'number' &&
                      parsed_line.line_number === highlight_line_number
                    return (
                      <tr
                        key={index}
                        style={{
                          backgroundColor: is_highlighted
                            ? 'rgba(255, 215, 0, 0.12)'
                            : 'transparent'
                        }}>
                        <td
                          style={{
                            color: 'var(--color-text-secondary)',
                            textAlign: 'right',
                            paddingRight: '12px',
                            borderRight: '1px solid var(--color-border-light)',
                            userSelect: 'none',
                            verticalAlign: 'top',
                            width: '40px'
                          }}>
                          {parsed_line.line_number ?? index + 1}
                        </td>
                        <td
                          style={{ paddingLeft: '12px', verticalAlign: 'top' }}>
                          {parsed_line.text || ' '}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : (
              content
            )}
          </Box>
        </Box>
      </Box>
    )
  }

  const get_action_button = () => {
    if (!tool_result_event) return null

    const result = tool_result_event?.content?.result
    const line_count = get_line_count(result)
    if (line_count === 0) return null

    return {
      label: `${line_count} lines`,
      onClick: () => set_show_content(!show_content)
    }
  }

  const working_directory = use_context_working_directory()

  const header_node = build_dual_tone_header({
    left_label: 'Read',
    right_label: format_relative_path({
      file_path: get_file_info().file_path,
      working_directory
    }),
    action_button: get_action_button()
  })

  return (
    <BaseToolComponent
      tool_call_event={tool_call_event}
      icon={<FileIcon fontSize='small' />}
      header={header_node}>
      {show_content && render_file_content()}
    </BaseToolComponent>
  )
}

ReadTool.propTypes = {
  tool_call_event: PropTypes.object.isRequired,
  tool_result_event: PropTypes.object
}

export default ReadTool
