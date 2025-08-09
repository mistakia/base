/**
 * Utility functions for counting messages and tool calls in thread sessions
 */

/**
 * Calculate the number of messages in timeline entries
 * @param {Array} timeline_entries - Array of timeline entry objects
 * @returns {number} Number of message entries
 */
export function calculate_message_count(timeline_entries) {
  if (!Array.isArray(timeline_entries)) {
    return 0
  }

  return timeline_entries.filter((entry) => entry.type === 'message').length
}

/**
 * Calculate the number of tool calls in timeline entries
 * @param {Array} timeline_entries - Array of timeline entry objects
 * @returns {number} Number of tool call entries
 */
export function calculate_tool_call_count(timeline_entries) {
  if (!Array.isArray(timeline_entries)) {
    return 0
  }

  return timeline_entries.filter((entry) => entry.type === 'tool_call').length
}

/**
 * Calculate both message and tool call counts from timeline entries
 * @param {Array} timeline_entries - Array of timeline entry objects
 * @returns {Object} Object containing message_count and tool_call_count
 */
export function calculate_session_counts(timeline_entries) {
  if (!Array.isArray(timeline_entries)) {
    return {
      message_count: 0,
      tool_call_count: 0
    }
  }

  const message_count = timeline_entries.filter(
    (entry) => entry.type === 'message'
  ).length
  const tool_call_count = timeline_entries.filter(
    (entry) => entry.type === 'tool_call'
  ).length

  return {
    message_count,
    tool_call_count
  }
}
