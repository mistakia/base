import React, { useState, useCallback } from 'react'
import PropTypes from 'prop-types'

import { API_URL } from '@core/constants'
import MarkdownViewer from '@components/primitives/MarkdownViewer.js'
import ExpandToggle from '@components/primitives/ExpandToggle'
import { process_message_content } from '@components/ThreadTimelineView/utils/message-processing.js'

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
    case 'tool_call': {
      const tool_name = content?.tool_name
      const tool_params = content?.tool_parameters || {}
      return get_tool_summary(tool_name, tool_params)
    }
    case 'tool_result':
      return content?.error ? 'Tool error' : 'Tool completed'
    case 'thinking':
      return 'Thinking...'
    case 'system': {
      const system_type = timeline_event.system_type
      if (system_type === 'state_change') {
        return typeof content === 'string'
          ? `State: ${truncate(content, 60)}`
          : 'State change'
      }
      if (system_type === 'error') {
        return typeof content === 'string'
          ? truncate(content, 80)
          : 'Error occurred'
      }
      return typeof content === 'string'
        ? truncate(content, 80)
        : 'System message'
    }
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
 * Fetch full timeline entry content from REST endpoint
 */
const fetch_full_timeline_entry = async ({ thread_id, entry_id }) => {
  const url = `${API_URL}/threads/${thread_id}/timeline/${entry_id}`
  const response = await fetch(url, { credentials: 'include' })
  if (!response.ok) {
    throw new Error(`Failed to fetch entry: ${response.statusText}`)
  }
  return response.json()
}

/**
 * CompactTimelineEvent
 *
 * A compact display of a timeline event for use in session cards.
 * Shows a brief summary of the event.
 * For assistant messages, shows markdown content with expand/collapse.
 * Supports truncated entries from tiered WebSocket delivery with on-demand
 * full content fetch for assistant message expansion.
 */
const CompactTimelineEvent = ({ timeline_event, thread_id }) => {
  // State for collapsing/expanding the message (default: collapsed)
  const [is_expanded, set_is_expanded] = useState(false)
  const [full_entry, set_full_entry] = useState(null)
  const [is_loading_entry, set_is_loading_entry] = useState(false)
  const [fetch_error, set_fetch_error] = useState(null)

  const toggle_expanded = useCallback(
    async (e) => {
      e.stopPropagation()

      if (is_expanded) {
        set_is_expanded(false)
        return
      }

      // If truncated and no full entry cached, fetch it
      if (
        timeline_event.truncated &&
        !full_entry &&
        thread_id &&
        timeline_event.id
      ) {
        set_is_loading_entry(true)
        set_fetch_error(null)
        try {
          const entry = await fetch_full_timeline_entry({
            thread_id,
            entry_id: timeline_event.id
          })
          set_full_entry(entry)
          set_is_expanded(true)
        } catch (error) {
          set_fetch_error(error.message)
        } finally {
          set_is_loading_entry(false)
        }
        return
      }

      set_is_expanded(true)
    },
    [is_expanded, timeline_event, full_entry, thread_id]
  )

  if (!timeline_event) return null

  // Special handling for assistant messages - show markdown content
  if (is_assistant_message(timeline_event)) {
    // Use full_entry if fetched (for truncated entries), otherwise use timeline_event
    const content_source = full_entry || timeline_event
    const full_content = get_assistant_content(content_source)

    return (
      <div className='compact-timeline-event compact-timeline-event--message'>
        <div className='compact-timeline-event__header'>
          <span className='compact-timeline-event__label'>Assistant</span>
          <ExpandToggle
            is_expanded={is_expanded}
            on_toggle={toggle_expanded}
            expanded_label='Collapse'
            collapsed_label={is_loading_entry ? 'Loading...' : 'Expand'}
          />
        </div>
        {fetch_error && (
          <div className='compact-timeline-event__error'>{fetch_error}</div>
        )}
        {is_expanded && (
          <div className='compact-timeline-event__content'>
            <MarkdownViewer content={full_content} />
          </div>
        )}
      </div>
    )
  }

  // Default compact display for other event types
  return (
    <div className='compact-timeline-event'>
      <span className='compact-timeline-event__summary'>
        {get_event_summary(timeline_event)}
      </span>
    </div>
  )
}

CompactTimelineEvent.propTypes = {
  timeline_event: PropTypes.shape({
    id: PropTypes.string,
    type: PropTypes.string.isRequired,
    content: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.object,
      PropTypes.array
    ]),
    role: PropTypes.string,
    truncated: PropTypes.bool
  }),
  thread_id: PropTypes.string
}

export default CompactTimelineEvent
