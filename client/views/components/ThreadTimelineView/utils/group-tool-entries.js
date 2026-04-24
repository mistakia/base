import { is_displayable_system_event } from './system-event-utils.js'
import { detect_skill_invocations } from './detect-skill-invocations.js'

// Utility to group tool calls with their corresponding results
export const group_tool_entries = (timeline_events) => {
  // Pre-pass: detect and pair skill invocation messages
  const { paired_indices, skill_groups } =
    detect_skill_invocations(timeline_events)

  // Build a map of index -> skill_group for insertion at first occurrence
  const skill_group_at_index = new Map()
  for (const group of skill_groups) {
    skill_group_at_index.set(group.indices[0], group)
  }

  const grouped_entries = []
  const pending_tool_calls = new Map() // Track tool calls waiting for results

  timeline_events.forEach((timeline_event, index) => {
    // Skip entries already paired as skill invocations
    if (paired_indices.has(index)) {
      // Insert skill_invocation group at the first index of each group
      const skill_group = skill_group_at_index.get(index)
      if (skill_group) {
        grouped_entries.push({
          type: 'skill_invocation',
          timeline_event: skill_group.skills[0].command_event,
          skills: skill_group.skills,
          user_text: skill_group.user_text,
          index
        })
      }
      return
    }
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
    } else if (timeline_event.type === 'tool_call') {
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
      const tool_call_id = timeline_event.content?.tool_call_id

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

  // Merge consecutive task tool pairs into task_group entries
  const TASK_TOOL_NAMES = new Set([
    'TaskCreate',
    'TaskUpdate',
    'TaskList',
    'TaskGet',
    'TaskOutput',
    'TaskStop',
    'AgentOutputTool'
  ])

  const sorted = grouped_entries.sort((a, b) => {
    const event_a = a.timeline_event || a.tool_call_event
    const event_b = b.timeline_event || b.tool_call_event

    const time_a = event_a?.timestamp
      ? new Date(event_a.timestamp).getTime()
      : 0
    const time_b = event_b?.timestamp
      ? new Date(event_b.timestamp).getTime()
      : 0

    // Handle invalid dates (NaN) by treating them as timestamp 0
    const safe_time_a = isNaN(time_a) ? 0 : time_a
    const safe_time_b = isNaN(time_b) ? 0 : time_b

    if (safe_time_a !== safe_time_b) {
      return safe_time_a - safe_time_b
    }

    // Fallback to original index for same-timestamp entries
    return a.index - b.index
  })

  const merged = []
  let current_task_group = null

  for (const entry of sorted) {
    const is_task_tool =
      entry.type === 'tool_pair' &&
      TASK_TOOL_NAMES.has(entry.tool_call_event?.content?.tool_name)

    if (is_task_tool) {
      if (!current_task_group) {
        current_task_group = {
          type: 'task_group',
          tool_pairs: [entry],
          index: entry.index
        }
      } else {
        current_task_group.tool_pairs.push(entry)
      }
    } else {
      if (current_task_group) {
        merged.push(current_task_group)
        current_task_group = null
      }
      merged.push(entry)
    }
  }

  if (current_task_group) {
    merged.push(current_task_group)
  }

  return merged
}

export default group_tool_entries
