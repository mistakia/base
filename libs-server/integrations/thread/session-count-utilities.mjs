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

/**
 * Calculate detailed message counts separated by user and assistant roles
 * @param {Array} timeline_entries - Array of timeline entry objects
 * @returns {Object} Object containing user_message_count and assistant_message_count
 */
export function calculate_detailed_message_counts(timeline_entries) {
  if (!Array.isArray(timeline_entries)) {
    return {
      user_message_count: 0,
      assistant_message_count: 0
    }
  }

  const user_message_count = timeline_entries.filter(
    (entry) => entry.type === 'message' && entry.role === 'user'
  ).length
  const assistant_message_count = timeline_entries.filter(
    (entry) => entry.type === 'message' && entry.role === 'assistant'
  ).length

  return {
    user_message_count,
    assistant_message_count
  }
}

/**
 * Aggregate token counts by type from provider metadata
 * @param {Object} provider_metadata - Provider-specific metadata containing token information
 * @returns {Object} Object containing aggregated token counts
 */
export function aggregate_token_counts(provider_metadata) {
  if (!provider_metadata || typeof provider_metadata !== 'object') {
    return {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      total_tokens: 0
    }
  }

  return {
    input_tokens: provider_metadata.input_tokens || 0,
    output_tokens: provider_metadata.output_tokens || 0,
    cache_creation_input_tokens:
      provider_metadata.cache_creation_input_tokens || 0,
    cache_read_input_tokens: provider_metadata.cache_read_input_tokens || 0,
    total_tokens: provider_metadata.total_tokens || 0
  }
}
