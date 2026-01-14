import React, { useState } from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'
import { useSelector } from 'react-redux'
import BaseToolComponent from '@views/components/ThreadTimelineView/ToolComponents/BaseToolComponent'
import { MonospaceText } from '@views/components/primitives/styled'
import {
  build_dual_tone_header,
  format_relative_path
} from '@views/components/ThreadTimelineView/ToolComponents/shared/title-utils'
import { ensure_string_result } from '@views/components/ThreadTimelineView/ToolComponents/shared/result-utils'
import { get_threads_state } from '@core/threads/selectors'

const WriteTool = ({ tool_call_event, tool_result_event }) => {
  const [show_content, set_show_content] = useState(false)
  const get_write_info = () => {
    const params = tool_call_event?.content?.tool_parameters || {}
    const file_path = params.file_path || 'Unknown file'
    const file_name = file_path.split('/').pop()
    const content = ensure_string_result(params.content)
    const file_ext = file_name?.split('.').pop()?.toLowerCase() || ''

    return { file_path, file_name, content, file_ext }
  }

  const render_file_content = () => {
    const { content } = get_write_info()
    if (!content) return null

    const lines = content.split('\n')
    const show_line_numbers = lines.length > 5

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
            {get_write_info().file_name} ({lines.length} lines)
          </MonospaceText>
        </Box>

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
                  {lines.map((line, index) => (
                    <tr key={index}>
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
                        {index + 1}
                      </td>
                      <td style={{ paddingLeft: '12px', verticalAlign: 'top' }}>
                        {line || ' '}
                      </td>
                    </tr>
                  ))}
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

  const { file_path, content } = get_write_info()

  const threads_state = useSelector(get_threads_state)
  const selected_thread_data = threads_state.get('selected_thread_data')
  const working_directory =
    selected_thread_data?.get('external_session')?.provider_metadata
      ?.working_directory

  const get_action_button = () => {
    if (!content) return null
    const lines = content.split('\n')
    return {
      label: `${lines.length} lines`,
      onClick: () => set_show_content(!show_content)
    }
  }

  const header_node = build_dual_tone_header({
    left_label: 'Write',
    right_label: format_relative_path({
      file_path,
      working_directory
    }),
    action_button: get_action_button()
  })

  return (
    <BaseToolComponent tool_call_event={tool_call_event} header={header_node}>
      {show_content && render_file_content()}
    </BaseToolComponent>
  )
}

WriteTool.propTypes = {
  tool_call_event: PropTypes.object.isRequired,
  tool_result_event: PropTypes.object
}

export default WriteTool
