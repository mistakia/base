import { is_displayable_system_event } from './system-event-utils.js'

// Utility to group tool calls with their corresponding results
export const group_tool_entries = (timeline_events) => {
  const grouped_entries = []
  const pending_tool_calls = new Map() // Track tool calls waiting for results

  timeline_events.forEach((timeline_event, index) => {
    if (timeline_event.type === 'message') {
      // Handle messages that might contain tool_use content blocks
      if (Array.isArray(timeline_event.content)) {
        timeline_event.content.forEach((content_block) => {
          if (content_block.type === 'tool_use') {
            const tool_call_id =
              content_block.metadata?.tool_id || content_block.id
            if (tool_call_id) {
              // Create a synthetic tool call entry
              const synthetic_tool_call = {
                ...timeline_event,
                type: 'tool_call',
                content: {
                  tool_name: content_block.metadata?.tool_name,
                  tool_parameters: content_block.metadata?.parameters,
                  tool_call_id
                }
              }
              pending_tool_calls.set(tool_call_id, {
                tool_call_event: synthetic_tool_call,
                tool_result_event: null,
                original_event: timeline_event,
                index
              })
            }
          }
        })
      }

      // Add regular message to grouped entries
      grouped_entries.push({
        type: 'regular',
        timeline_event,
        index
      })
    } else if (
      timeline_event.type === 'tool_call' ||
      timeline_event.type === 'tool_use'
    ) {
      // Direct tool call entry
      const tool_call_id =
        timeline_event.content?.tool_call_id ||
        timeline_event.metadata?.tool_id ||
        timeline_event.id

      if (tool_call_id) {
        pending_tool_calls.set(tool_call_id, {
          tool_call_event: timeline_event,
          tool_result_event: null,
          original_event: timeline_event,
          index
        })
      } else {
        // Orphaned tool call without ID
        grouped_entries.push({
          type: 'tool_pair',
          tool_call_event: timeline_event,
          tool_result_event: null,
          index
        })
      }
    } else if (timeline_event.type === 'tool_result') {
      // Tool result entry
      const tool_call_id =
        timeline_event.content?.tool_call_id ||
        timeline_event.content?.tool_use_id

      if (tool_call_id && pending_tool_calls.has(tool_call_id)) {
        // Found matching tool call
        const tool_pair = pending_tool_calls.get(tool_call_id)
        tool_pair.tool_result_event = timeline_event

        // Add the completed pair to grouped entries
        grouped_entries.push({
          type: 'tool_pair',
          tool_call_event: tool_pair.tool_call_event,
          tool_result_event: timeline_event,
          index: tool_pair.index
        })

        // Remove from pending
        pending_tool_calls.delete(tool_call_id)
      } else {
        // Orphaned tool result without matching call
        grouped_entries.push({
          type: 'orphaned_result',
          timeline_event,
          index
        })
      }
    } else {
      // Other event types (error, system, thinking, etc.)
      // Filter system events to only show displayable ones (warnings, errors, interrupts)
      if (
        timeline_event.type === 'system' &&
        !is_displayable_system_event(timeline_event)
      ) {
        return // Skip non-displayable system events
      }

      grouped_entries.push({
        type: 'regular',
        timeline_event,
        index
      })
    }
  })

  // Add any remaining unpaired tool calls
  pending_tool_calls.forEach((tool_pair) => {
    grouped_entries.push({
      type: 'tool_pair',
      tool_call_event: tool_pair.tool_call_event,
      tool_result_event: null,
      index: tool_pair.index
    })
  })

  // Sort by original index to maintain chronological order
  return grouped_entries.sort((a, b) => a.index - b.index)
}

export default group_tool_entries
