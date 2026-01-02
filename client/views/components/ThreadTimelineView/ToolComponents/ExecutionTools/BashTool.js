import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'

import { COLORS } from '@theme/colors.js'
import { code_to_html } from '@core/shiki-highlighter.js'
import { MonospaceText } from '@views/components/primitives/styled'

const BashTool = ({ tool_call_event, tool_result_event }) => {
  const [highlighted_command, set_highlighted_command] = useState('')
  const get_command_info = () => {
    const params = tool_call_event?.content?.tool_parameters || {}
    const command = params.command || 'unknown command'
    const description = params.description || ''
    const timeout = params.timeout || null

    return { command, description, timeout }
  }

  useEffect(() => {
    const { command } = get_command_info()

    const highlight_command = async () => {
      try {
        const html = await code_to_html(command, {
          lang: 'bash',
          theme: 'github-dark',
          transformers: []
        })
        set_highlighted_command(html)
      } catch (err) {
        console.error('Failed to highlight bash command:', err)
        set_highlighted_command('')
      }
    }

    highlight_command()
  }, [tool_call_event])

  const get_execution_result = () => {
    if (!tool_result_event) return null

    const result = tool_result_event?.content?.result || ''

    // Ensure result is a string before calling string methods
    const result_string = typeof result === 'string' ? result : String(result)

    // Try to detect if command succeeded
    const is_error =
      result_string.toLowerCase().includes('error') ||
      result_string.toLowerCase().includes('failed') ||
      result_string.toLowerCase().includes('command not found') ||
      result_string.toLowerCase().includes('permission denied')

    // Check for common success patterns
    const has_output = result_string.trim().length > 0

    return {
      output: result_string,
      is_error,
      has_output,
      exit_code: null // Could extract if available in result
    }
  }

  const render_terminal_view = () => {
    const execution_result = get_execution_result()

    return (
      <Box
        sx={{
          border: `1px solid ${COLORS.terminal_border}`,
          borderRadius: 1,
          bgcolor: COLORS.terminal_bg,
          overflow: 'hidden',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
        }}>
        <Box
          sx={{
            p: 2,
            bgcolor: COLORS.terminal_bg
          }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              mb: execution_result?.has_output ? 1 : 0
            }}>
            <MonospaceText
              variant='xs'
              sx={{
                color: COLORS.terminal_success,
                mr: 1,
                fontWeight: 'bold',
                userSelect: 'none',
                fontSize: '13px'
              }}>
              $
            </MonospaceText>
            {highlighted_command ? (
              <Box
                dangerouslySetInnerHTML={{ __html: highlighted_command }}
                sx={{
                  '& pre': {
                    m: 0,
                    p: 0,
                    background: 'transparent !important',
                    fontSize: '13px',
                    lineHeight: 1.4,
                    fontFamily: 'var(--font-family-mono)'
                  },
                  '& code': {
                    background: 'transparent !important',
                    padding: '0 !important'
                  },
                  overflowX: 'auto'
                }}
              />
            ) : (
              <MonospaceText
                variant='xs'
                component='pre'
                sx={{
                  color: COLORS.terminal_text,
                  m: 0,
                  whiteSpace: 'pre',
                  overflowX: 'auto',
                  fontSize: '13px',
                  lineHeight: 1.4
                }}>
                {get_command_info().command}
              </MonospaceText>
            )}
          </Box>
          {execution_result?.has_output && (
            <Box sx={{ mt: 1 }}>
              <MonospaceText
                variant='xs'
                component='pre'
                sx={{
                  m: 0,
                  whiteSpace: 'pre-wrap',
                  color: execution_result.is_error
                    ? COLORS.terminal_error
                    : COLORS.terminal_muted,
                  fontSize: '13px',
                  lineHeight: 1.4,
                  maxHeight: '200px',
                  overflowY: 'auto',
                  borderTop: `1px solid ${COLORS.terminal_border}`,
                  pt: 1
                }}>
                {execution_result.output}
              </MonospaceText>
            </Box>
          )}
        </Box>
      </Box>
    )
  }

  return render_terminal_view()
}

BashTool.propTypes = {
  tool_call_event: PropTypes.object.isRequired,
  tool_result_event: PropTypes.object
}

export default BashTool
