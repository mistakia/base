import React from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'

import UserMessage from './UserMessage'
import AssistantMessage from './AssistantMessage'
import ThinkingMessage from './ThinkingMessage'
import SystemMessage from './SystemMessage'
import ThreadStateChangeMessage from './ThreadStateChangeMessage'
import ToolEvent from './ToolEvent'
import HookMessage from './HookMessage'
import TaskNotificationMessage from './TaskNotificationMessage'
import { process_message_content } from './utils/message-processing.js'

const TimelineEvent = ({
  timeline_event,
  tool_result_event,
  is_last_assistant_message,
  timeline,
  working_directory = null,
  render_nested_timeline
}) => {
  // Check if this is a hook message
  const is_hook =
    timeline_event?.type === 'message' &&
    timeline_event.role === 'user' &&
    typeof timeline_event.content === 'string' &&
    /<.+-hook>/.test(timeline_event.content)

  // Check if this is a task notification message
  const is_task_notification =
    timeline_event?.type === 'message' &&
    timeline_event.role === 'user' &&
    typeof timeline_event.content === 'string' &&
    /<task-notification>/.test(timeline_event.content)

  // Determine if this event has no meaningful content and should be hidden entirely
  let should_hide_event = false
  if (timeline_event?.type === 'message' && !is_hook && !is_task_notification) {
    const processed = process_message_content({
      content: timeline_event.content,
      working_directory
    })
    should_hide_event = processed.is_empty
  }

  if (should_hide_event) return null

  const render_event_content = () => {
    switch (timeline_event.type) {
      case 'message':
        if (timeline_event.role === 'user') {
          if (is_hook) {
            return <HookMessage message={timeline_event} />
          }
          if (is_task_notification) {
            return <TaskNotificationMessage message={timeline_event} />
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
              disable_truncation={is_last_assistant_message}
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
      // Legacy: pre-migration entries still use the retired `thread_state_change`
      // type until `cli/migrate-timeline-to-5-types.mjs` runs on stored data.
      case 'thread_state_change':
        return <ThreadStateChangeMessage event={timeline_event} />
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

  return <Box sx={{ mb: 2 }}>{render_event_content()}</Box>
}

TimelineEvent.propTypes = {
  timeline_event: PropTypes.object.isRequired,
  tool_result_event: PropTypes.object,
  is_last_assistant_message: PropTypes.bool,
  timeline: PropTypes.array,
  working_directory: PropTypes.string,
  render_nested_timeline: PropTypes.func
}

export default TimelineEvent
