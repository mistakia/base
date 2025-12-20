import React, { useState, useCallback } from 'react'
import PropTypes from 'prop-types'
import {
  Message as MessageIcon,
  CheckCircle as CompleteIcon,
  Error as ErrorIcon,
  TerminalOutlined as ToolIcon,
  AccountCircleOutlined as UserIcon,
  AutoAwesomeOutlined as AssistantIcon,
  Language as BrowserIcon,
  ErrorOutline as SystemIcon,
  Lightbulb as ThinkingIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon
} from '@mui/icons-material'

import MarkdownViewer from '@components/primitives/MarkdownViewer.js'
import { process_message_content } from '@components/ThreadTimelineView/utils/message-processing.js'

const MAX_COLLAPSED_LENGTH = 500

/**
 * Get tool-specific icon based on tool name
 */
const get_tool_icon_by_name = (tool_name) => {
  const icon_props = { fontSize: 'inherit' }

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
 * Get event icon based on event type
 */
const get_event_icon = (timeline_event) => {
  const icon_props = { fontSize: 'inherit' }

  switch (timeline_event.type) {
    case 'message':
      return timeline_event.role === 'user' ? (
        <UserIcon {...icon_props} />
      ) : (
        <AssistantIcon {...icon_props} />
      )
    case 'tool_call':
    case 'tool_use': {
      const tool_name = timeline_event.content?.tool_name
      return get_tool_icon_by_name(tool_name)
    }
    case 'tool_result':
      return <ToolIcon {...icon_props} />
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
 * Truncate text to max length with ellipsis
 */
const truncate = (text, max_length = 60) => {
  if (!text) return ''
  return text.length > max_length ? `${text.substring(0, max_length)}...` : text
}

/**
 * Extract filename from a path
 */
const get_filename = (path) => {
  if (!path) return ''
  return path.split('/').pop() || path
}

/**
 * Get tool-specific summary for tool calls
 */
const get_tool_summary = (tool_name, tool_input) => {
  if (!tool_name) return 'Unknown tool'

  // File reading tools
  if (tool_name === 'Read') {
    const file = get_filename(tool_input?.file_path)
    return file ? `Read ${file}` : 'Read file'
  }

  // File editing tools
  if (tool_name === 'Edit') {
    const file = get_filename(tool_input?.file_path)
    return file ? `Edit ${file}` : 'Edit file'
  }

  // File writing tools
  if (tool_name === 'Write') {
    const file = get_filename(tool_input?.file_path)
    return file ? `Write ${file}` : 'Write file'
  }

  // File search tools
  if (tool_name === 'Glob') {
    const pattern = tool_input?.pattern
    return pattern ? `Glob ${truncate(pattern, 40)}` : 'Glob search'
  }

  if (tool_name === 'Grep') {
    const pattern = tool_input?.pattern
    return pattern ? `Grep ${truncate(pattern, 40)}` : 'Grep search'
  }

  // Bash commands
  if (tool_name === 'Bash') {
    const command = tool_input?.command
    if (command) {
      // Get first line and truncate
      const first_line = command.split('\n')[0]
      return truncate(first_line, 50)
    }
    return 'Run command'
  }

  // Task agent
  if (tool_name === 'Task') {
    const description = tool_input?.description
    return description ? truncate(description, 50) : 'Run task'
  }

  // Web tools
  if (tool_name === 'WebSearch') {
    const query = tool_input?.query
    return query ? `Search: ${truncate(query, 40)}` : 'Web search'
  }

  if (tool_name === 'WebFetch') {
    const url = tool_input?.url
    if (url) {
      try {
        const hostname = new URL(url).hostname
        return `Fetch ${hostname}`
      } catch {
        return `Fetch ${truncate(url, 40)}`
      }
    }
    return 'Fetch URL'
  }

  // TodoWrite
  if (tool_name === 'TodoWrite') {
    return 'Update todos'
  }

  // MCP tools - extract meaningful part
  if (tool_name.startsWith('mcp__')) {
    // Format: mcp__server__tool_name
    const parts = tool_name.split('__')
    if (parts.length >= 3) {
      const mcp_tool = parts.slice(2).join('_')
      // Make it more readable
      return mcp_tool.replace(/_/g, ' ')
    }
  }

  // Notebook edit
  if (tool_name === 'NotebookEdit') {
    const file = get_filename(tool_input?.notebook_path)
    return file ? `Edit ${file}` : 'Edit notebook'
  }

  // Default: just show the tool name
  return tool_name
}

/**
 * Get a compact summary of the event content
 */
const get_event_summary = (timeline_event) => {
  const { type, content, role } = timeline_event

  switch (type) {
    case 'message': {
      if (typeof content === 'string') {
        // Truncate long messages
        const clean_content = content.replace(/<[^>]+>/g, '').trim()
        return truncate(clean_content, 80)
      }
      // Handle content array (Claude messages)
      if (Array.isArray(content)) {
        const text_blocks = content.filter((b) => b.type === 'text')
        if (text_blocks.length > 0) {
          const text = text_blocks[0].text || ''
          return truncate(text, 80)
        }
      }
      return role === 'user' ? 'User message' : 'Assistant response'
    }
    case 'tool_call':
    case 'tool_use': {
      const tool_name = content?.tool_name
      const tool_params = content?.tool_parameters || content?.input || {}
      return get_tool_summary(tool_name, tool_params)
    }
    case 'tool_result':
      return content?.error ? 'Tool error' : 'Tool completed'
    case 'thinking':
      return 'Thinking...'
    case 'system':
      return 'System message'
    case 'completion':
      return 'Completed'
    case 'error':
      return content?.message || 'Error occurred'
    default:
      return type
  }
}

/**
 * Check if event is an assistant message
 */
const is_assistant_message = (timeline_event) => {
  return (
    timeline_event.type === 'message' && timeline_event.role === 'assistant'
  )
}

/**
 * Get processed content for assistant messages
 */
const get_assistant_content = (timeline_event) => {
  const { content } = timeline_event

  if (typeof content === 'string') {
    const { content: processed } = process_message_content({ content })
    return processed
  }

  // Handle content array (Claude messages)
  if (Array.isArray(content)) {
    const text_blocks = content.filter((b) => b.type === 'text')
    if (text_blocks.length > 0) {
      const combined = text_blocks.map((b) => b.text || '').join('\n\n')
      const { content: processed } = process_message_content({
        content: combined
      })
      return processed
    }
  }

  return ''
}

/**
 * CompactTimelineEvent
 *
 * A compact display of a timeline event for use in session cards.
 * Shows an icon and a brief summary of the event.
 * For assistant messages, shows markdown content with expand/collapse.
 */
const CompactTimelineEvent = ({ timeline_event }) => {
  const [is_expanded, set_is_expanded] = useState(false)
  const toggle_expanded = useCallback((e) => {
    e.stopPropagation()
    set_is_expanded((v) => !v)
  }, [])

  if (!timeline_event) return null

  // Special handling for assistant messages - show markdown content
  if (is_assistant_message(timeline_event)) {
    const full_content = get_assistant_content(timeline_event)
    const should_truncate = full_content.length > MAX_COLLAPSED_LENGTH
    const display_content =
      should_truncate && !is_expanded
        ? full_content.substring(0, MAX_COLLAPSED_LENGTH) + '...'
        : full_content

    return (
      <div className='compact-timeline-event compact-timeline-event--message'>
        <div className='compact-timeline-event__header'>
          <span className='compact-timeline-event__icon'>
            {get_event_icon(timeline_event)}
          </span>
          <span className='compact-timeline-event__label'>Assistant</span>
          {should_truncate && (
            <button
              className='compact-timeline-event__toggle'
              onClick={toggle_expanded}
              type='button'>
              {is_expanded ? (
                <>
                  <ExpandLessIcon fontSize='inherit' />
                  <span>Less</span>
                </>
              ) : (
                <>
                  <ExpandMoreIcon fontSize='inherit' />
                  <span>More</span>
                </>
              )}
            </button>
          )}
        </div>
        <div className='compact-timeline-event__content'>
          <MarkdownViewer content={display_content} />
        </div>
      </div>
    )
  }

  // Default compact display for other event types
  return (
    <div className='compact-timeline-event'>
      <span className='compact-timeline-event__icon'>
        {get_event_icon(timeline_event)}
      </span>
      <span className='compact-timeline-event__summary'>
        {get_event_summary(timeline_event)}
      </span>
    </div>
  )
}

CompactTimelineEvent.propTypes = {
  timeline_event: PropTypes.shape({
    type: PropTypes.string.isRequired,
    content: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.object,
      PropTypes.array
    ]),
    role: PropTypes.string
  })
}

export default CompactTimelineEvent
