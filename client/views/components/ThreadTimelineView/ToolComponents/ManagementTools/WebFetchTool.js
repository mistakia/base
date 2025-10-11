import React, { useState } from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'
import BaseToolComponent from '@components/ThreadTimelineView/ToolComponents/BaseToolComponent'
import { build_dual_tone_header } from '@components/ThreadTimelineView/ToolComponents/shared/title-utils.js'
import MarkdownViewer from '@views/components/primitives/MarkdownViewer.js'

const WebFetchTool = ({ tool_call_event, tool_result_event }) => {
  const [show_content, set_show_content] = useState(false)

  const get_tool_info = () => {
    const tool_name = tool_call_event?.content?.tool_name || ''
    const params = tool_call_event?.content?.tool_parameters || {}

    if (tool_name === 'WebSearch') {
      const query = params.query || ''
      return {
        type: 'search',
        title: `Search ${query}`,
        params
      }
    } else {
      // WebFetch
      const url = params.url || ''
      const formatted_url = format_url(url)
      return {
        type: 'fetch',
        title: `View ${formatted_url}`,
        params
      }
    }
  }

  const format_url = (url) => {
    try {
      const parsed = new URL(url)
      let hostname = parsed.hostname
      // Remove www. prefix
      if (hostname.startsWith('www.')) {
        hostname = hostname.substring(4)
      }
      const path = parsed.pathname
      return `${hostname}${path}`
    } catch {
      return url
    }
  }

  const get_result_content = () => {
    if (!tool_result_event) return null

    let result = tool_result_event?.content?.result || ''

    // Ensure result is always a string
    if (typeof result === 'object') {
      result = JSON.stringify(result, null, 2)
    } else if (typeof result !== 'string') {
      result = String(result)
    }

    return result.trim()
  }

  const { type, params } = get_tool_info()
  const result_content = get_result_content()
  const has_content = result_content && result_content.length > 0

  const action_button = has_content
    ? {
        label: show_content ? 'hide content' : 'show content',
        onClick: () => set_show_content(!show_content)
      }
    : null

  const header = build_dual_tone_header({
    left_label: type === 'search' ? 'Search' : 'View',
    right_label:
      type === 'search' ? params.query || '' : format_url(params.url || ''),
    action_button
  })

  return (
    <BaseToolComponent tool_call_event={tool_call_event} header={header}>
      {show_content && has_content && (
        <Box>
          {type === 'fetch' && params.prompt && (
            <Box
              sx={{
                border: '1px solid',
                borderColor: 'grey.300',
                borderRadius: 1,
                p: 2,
                mb: 2,
                bgcolor: 'grey.50'
              }}>
              <Box
                sx={{
                  fontSize: '12px',
                  fontWeight: 500,
                  mb: 1,
                  color: 'text.secondary'
                }}>
                Prompt:
              </Box>
              <Box sx={{ fontSize: '13px', lineHeight: 1.4 }}>
                {params.prompt}
              </Box>
            </Box>
          )}
          <Box
            sx={{
              border: '1px solid',
              borderColor: 'grey.300',
              borderRadius: 1,
              overflow: 'hidden',
              p: 2
            }}>
            <MarkdownViewer content={result_content} />
          </Box>
        </Box>
      )}
    </BaseToolComponent>
  )
}

WebFetchTool.propTypes = {
  tool_call_event: PropTypes.object.isRequired,
  tool_result_event: PropTypes.object
}

export default WebFetchTool
