import React, { useState } from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'
import { Edit as EditIcon } from '@mui/icons-material'
import { useSelector } from 'react-redux'
import BaseToolComponent from '../BaseToolComponent'
import {
  build_dual_tone_header,
  format_relative_path,
  format_count_label
} from '@views/components/ThreadTimelineView/ToolComponents/shared/title-utils'
import { get_threads_state } from '@core/threads/selectors'
import { MonospaceText } from '@views/components/primitives/styled/index.js'

const MultiEditTool = ({ tool_call_event }) => {
  const [show_edits, set_show_edits] = useState(false)

  const get_edit_info = () => {
    const params = tool_call_event?.content?.tool_parameters || {}
    const file_path = params.file_path || 'Unknown file'
    const edits = params.edits || []
    return { file_path, edits }
  }

  const threads_state = useSelector(get_threads_state)
  const selected_thread_data = threads_state.get('selected_thread_data')
  const working_directory =
    selected_thread_data?.get('external_session')?.provider_metadata
      ?.working_directory

  const get_action_button = () => {
    const { edits } = get_edit_info()
    if (!edits || edits.length === 0) return null
    return {
      label: show_edits
        ? 'hide'
        : format_count_label({ count: edits.length, singular: 'Edit' }),
      onClick: () => set_show_edits(!show_edits)
    }
  }

  const header_node = build_dual_tone_header({
    left_label: 'Edit',
    right_label: format_relative_path({
      file_path: get_edit_info().file_path,
      working_directory
    }),
    action_button: get_action_button()
  })

  const render_edit_block = (edit, index) => {
    const old_text = edit.old_string || ''
    const new_text = edit.new_string || ''
    const old_lines = old_text.split('\n')
    const new_lines = new_text.split('\n')
    const old_prefixed = old_text
      ? old_lines.map((l) => `- ${l}`).join('\n')
      : '-'
    const new_prefixed = new_text
      ? new_lines.map((l) => `+ ${l}`).join('\n')
      : '+'
    return (
      <Box
        key={index}
        sx={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
          gap: 0,
          mb: 'var(--space-sm)',
          borderRadius: 'var(--radius-base)',
          overflow: 'hidden',
          width: '100%'
        }}>
        <Box
          sx={{
            p: 'var(--space-sm)',
            bgcolor:
              'color-mix(in srgb, var(--color-error) 12%, var(--color-code-bg))',
            minWidth: 0
          }}>
          <MonospaceText
            variant='xs'
            component='pre'
            sx={{
              m: 0,
              whiteSpace: 'pre',
              maxHeight: '200px',
              overflowY: 'auto',
              overflowX: 'auto',
              fontSize: '10px',
              lineHeight: 1.35
            }}>
            {old_prefixed}
          </MonospaceText>
        </Box>
        <Box
          sx={{
            p: 'var(--space-sm)',
            bgcolor:
              'color-mix(in srgb, var(--color-success) 12%, var(--color-code-bg))',
            minWidth: 0
          }}>
          <MonospaceText
            variant='xs'
            component='pre'
            sx={{
              m: 0,
              whiteSpace: 'pre',
              maxHeight: '200px',
              overflowY: 'auto',
              overflowX: 'auto',
              fontSize: '10px',
              lineHeight: 1.35
            }}>
            {new_prefixed}
          </MonospaceText>
        </Box>
      </Box>
    )
  }

  const { edits } = get_edit_info()

  return (
    <BaseToolComponent
      tool_call_event={tool_call_event}
      icon={<EditIcon fontSize='small' />}
      header={header_node}>
      {show_edits && (
        <Box sx={{ pl: 0 }}>
          {edits.map((edit, index) => render_edit_block(edit, index))}
        </Box>
      )}
    </BaseToolComponent>
  )
}

MultiEditTool.propTypes = {
  tool_call_event: PropTypes.object.isRequired,
  tool_result_event: PropTypes.object
}

export default MultiEditTool
