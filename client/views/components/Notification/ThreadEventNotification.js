import React from 'react'
import PropTypes from 'prop-types'
import { Link } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
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

import UserMessage from '@components/ThreadTimelineView/UserMessage'
import AssistantMessage from '@components/ThreadTimelineView/AssistantMessage'
import ThinkingMessage from '@components/ThreadTimelineView/ThinkingMessage'
import SystemMessage from '@components/ThreadTimelineView/SystemMessage'
import ToolEvent from '@components/ThreadTimelineView/ToolEvent'
import HookMessage from '@components/ThreadTimelineView/HookMessage'

/**
 * Get event icon using the same logic as TimelineEvent
 */
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
    default:
      return <ToolIcon {...icon_props} />
  }
}

/**
 * Get event icon using the same logic as TimelineEvent
 */
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
    case 'tool_use': {
      // Use tool-specific icon based on tool name
      const tool_name = timeline_event.content?.tool_name
      return get_tool_icon_by_name(tool_name)
    }
    case 'tool_result': {
      // Tool result doesn't have tool_name, use generic tool icon
      return <ToolIcon {...icon_props} />
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

/**
 * Render event content using the same logic as TimelineEvent
 */
const render_event_content = ({ timeline_event, working_directory = null }) => {
  // Check if this is a hook message
  const is_hook =
    timeline_event?.type === 'message' &&
    timeline_event.role === 'user' &&
    typeof timeline_event.content === 'string' &&
    /<.+-hook>/.test(timeline_event.content)

  switch (timeline_event.type) {
    case 'message':
      if (timeline_event.role === 'user') {
        // Check if this is a hook message
        if (is_hook) {
          return <HookMessage message={timeline_event} />
        }
        return (
          <UserMessage
            message={timeline_event}
            working_directory={working_directory}
          />
        )
      } else {
        return (
          <AssistantMessage
            message={timeline_event}
            working_directory={working_directory}
            disable_truncation={false}
            is_last_assistant_message={false}
          />
        )
      }
    case 'thinking':
      return (
        <ThinkingMessage
          message={timeline_event}
          working_directory={working_directory}
        />
      )
    case 'system':
      return (
        <SystemMessage
          message={timeline_event}
          working_directory={working_directory}
        />
      )
    case 'tool_use':
    case 'tool_call':
      return (
        <ToolEvent
          tool_call_event={timeline_event}
          tool_result_event={null}
          timeline={[]}
          render_nested_timeline={() => null}
        />
      )
    case 'tool_result':
      // Tool result entries don't have tool_name, show result content
      return (
        <Box sx={{ fontSize: '14px', color: 'white' }}>
          <Typography variant='body2' sx={{ color: 'white', mb: 1 }}>
            Tool Result
          </Typography>
          {timeline_event.content?.error ? (
            <Typography variant='body2' sx={{ color: '#ffcdd2' }}>
              Error:{' '}
              {typeof timeline_event.content.error === 'string'
                ? timeline_event.content.error
                : JSON.stringify(timeline_event.content.error)}
            </Typography>
          ) : (
            <Typography variant='body2' sx={{ color: 'white', opacity: 0.9 }}>
              {typeof timeline_event.content?.result === 'string'
                ? timeline_event.content.result
                : timeline_event.content?.result
                  ? JSON.stringify(timeline_event.content.result, null, 2)
                  : 'No result'}
            </Typography>
          )}
        </Box>
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

/**
 * ThreadEventNotification
 *
 * Rich notification component for thread timeline events
 * Displays thread title, event type, and provides a link to view the thread
 *
 * TEMPORARY: For testing different notification types, enable demo mode:
 * - Add ?demo=true to URL, or
 * - Run: localStorage.setItem('notificationDemo', 'true')
 * A demo panel will appear in the top-right corner to test all event types.
 */
const ThreadEventNotification = ({
  thread_id,
  thread_title,
  entry,
  on_close,
  working_directory = null
}) => {
  const display_title = thread_title || thread_id
  const thread_link = `/thread/${thread_id}`

  // Use entry as timeline_event for rendering
  const timeline_event = entry

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5
      }}>
      {/* Thread title with event icon */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box
          sx={{
            color: 'white',
            display: 'flex',
            alignItems: 'center'
          }}>
          {get_event_icon(timeline_event)}
        </Box>
        <Typography
          variant='body1'
          component='div'
          sx={{ fontWeight: 500, color: 'white', flex: 1 }}>
          {display_title}
        </Typography>
      </Box>

      {/* Event content */}
      <Box
        sx={{
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          borderRadius: 1,
          p: 1.5,
          maxHeight: '300px',
          overflow: 'auto'
        }}>
        {render_event_content({ timeline_event, working_directory })}
      </Box>

      {/* View thread button */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.5 }}>
        <Button
          component={Link}
          to={thread_link}
          size='small'
          variant='outlined'
          endIcon={<OpenInNewIcon />}
          onClick={on_close}
          sx={{
            color: 'white',
            borderColor: 'rgba(255, 255, 255, 0.5)',
            '&:hover': {
              borderColor: 'rgba(255, 255, 255, 0.8)',
              backgroundColor: 'rgba(255, 255, 255, 0.1)'
            }
          }}>
          View Thread
        </Button>
      </Box>
    </Box>
  )
}

ThreadEventNotification.propTypes = {
  thread_id: PropTypes.string.isRequired,
  thread_title: PropTypes.string,
  entry: PropTypes.shape({
    type: PropTypes.string.isRequired,
    content: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
    role: PropTypes.string,
    error_type: PropTypes.string
  }).isRequired,
  on_close: PropTypes.func.isRequired,
  working_directory: PropTypes.string
}

export default ThreadEventNotification
