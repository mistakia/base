import React from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'
import {
  Message as MessageIcon,
  CheckCircle as CompleteIcon,
  Error as ErrorIcon,
  TerminalOutlined as ToolIcon,
  AccountCircleOutlined as UserIcon,
  AutoAwesomeOutlined as AssistantIcon,
  Language as BrowserIcon,
  ErrorOutline as SystemIcon,
  Lightbulb as ThinkingIcon
} from '@mui/icons-material'

import UserMessage from './UserMessage'
import AssistantMessage from './AssistantMessage'
import ThinkingMessage from './ThinkingMessage'
import ToolEvent from './ToolEvent'
import { process_message_content } from './utils/message-processing.js'

const TimelineEvent = ({
  timeline_event,
  tool_result_event,
  is_last_assistant_message,
  timeline,
  render_nested_timeline,
  hide_timeline_dot = false
}) => {
  // Determine if this event has no meaningful content and should be hidden entirely
  let should_hide_event = false
  if (timeline_event?.type === 'message') {
    const processed = process_message_content({
      content: timeline_event.content
    })
    should_hide_event = processed.is_empty
  }

  if (should_hide_event) return null

  const get_tool_icon_by_name = (tool_name) => {
    const icon_props = { fontSize: 'small' }

    // Handle MCP browser tools
    if (tool_name?.startsWith('mcp__playwright__browser_')) {
      return <BrowserIcon {...icon_props} />
    }

    // Handle other specific tool patterns
    switch (tool_name) {
      case 'WebSearch':
      case 'WebFetch':
        return <BrowserIcon {...icon_props} />
      // Add more specific tool icons here as needed
      default:
        return <ToolIcon {...icon_props} />
    }
  }

  const get_event_icon = (timeline_event) => {
    const icon_props = { fontSize: 'small' }

    switch (timeline_event.type) {
      case 'message':
        return timeline_event.role === 'user' ? (
          <UserIcon {...icon_props} />
        ) : (
          <AssistantIcon {...icon_props} />
        )
      case 'tool_call':
      case 'tool_use':
      case 'tool_result': {
        // Use tool-specific icon based on tool name
        const tool_name = timeline_event.content?.tool_name
        return get_tool_icon_by_name(tool_name)
      }
      case 'completion':
        return <CompleteIcon {...icon_props} />

      case 'error':
        return <ErrorIcon {...icon_props} />

      case 'thinking':
        return <ThinkingIcon {...icon_props} />

      case 'system':
        return <SystemIcon {...icon_props} />

      default:
        return <MessageIcon {...icon_props} />
    }
  }

  const render_event_content = () => {
    switch (timeline_event.type) {
      case 'message':
        if (timeline_event.role === 'user') {
          return <UserMessage message={timeline_event} />
        } else {
          return (
            <AssistantMessage
              message={timeline_event}
              disable_truncation={is_last_assistant_message}
              is_last_assistant_message={is_last_assistant_message}
            />
          )
        }
      case 'thinking':
        return <ThinkingMessage message={timeline_event} />
      case 'tool_use':
      case 'tool_call':
      case 'tool_result':
        return (
          <ToolEvent
            tool_call_event={timeline_event}
            tool_result_event={tool_result_event}
            timeline={timeline}
            render_nested_timeline={render_nested_timeline}
          />
        )
      default:
        return (
          <span style={{ whiteSpace: 'pre-wrap', fontSize: '14px' }}>
            {typeof timeline_event.content === 'string'
              ? timeline_event.content
              : timeline_event.content
                ? JSON.stringify(timeline_event.content, null, 2)
                : 'No content'}
          </span>
        )
    }
  }

  return (
    <Box sx={{ display: 'flex', mb: 2, position: 'relative' }}>
      {/* Timeline dot */}
      {!hide_timeline_dot && (
        <Box
          sx={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            alignItems: 'flex-start',
            pt: 0.5
          }}>
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              backgroundColor: 'var(--color-surface)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mr: 2,
              flexShrink: 0
            }}>
            {get_event_icon(timeline_event)}
          </Box>
        </Box>
      )}

      {/* Timeline content */}
      <Box
        sx={{ flex: 1, minWidth: 0, backgroundColor: 'var(--color-surface)' }}>
        {timeline_event.type !== 'message' && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              mb: 1
            }}></Box>
        )}

        {render_event_content()}
      </Box>
    </Box>
  )
}

TimelineEvent.propTypes = {
  timeline_event: PropTypes.object.isRequired,
  tool_result_event: PropTypes.object,
  is_last_assistant_message: PropTypes.bool,
  timeline: PropTypes.array,
  render_nested_timeline: PropTypes.func,
  hide_timeline_dot: PropTypes.bool
}

export default TimelineEvent
