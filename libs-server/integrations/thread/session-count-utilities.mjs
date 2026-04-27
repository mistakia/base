/**
 * Utility functions for session analysis including message counts,
 * token aggregation, and prompt extraction
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
      context_input_tokens: 0,
      context_cache_creation_input_tokens: 0,
      context_cache_read_input_tokens: 0,
      cumulative_input_tokens: 0,
      cumulative_output_tokens: 0,
      cumulative_cache_creation_input_tokens: 0,
      cumulative_cache_read_input_tokens: 0,
      total_tokens: 0
    }
  }

  return {
    context_input_tokens: provider_metadata.context_input_tokens || 0,
    context_cache_creation_input_tokens:
      provider_metadata.context_cache_creation_input_tokens || 0,
    context_cache_read_input_tokens:
      provider_metadata.context_cache_read_input_tokens || 0,
    cumulative_input_tokens: provider_metadata.cumulative_input_tokens || 0,
    cumulative_output_tokens: provider_metadata.cumulative_output_tokens || 0,
    cumulative_cache_creation_input_tokens:
      provider_metadata.cumulative_cache_creation_input_tokens || 0,
    cumulative_cache_read_input_tokens:
      provider_metadata.cumulative_cache_read_input_tokens || 0,
    total_tokens: provider_metadata.total_tokens || 0
  }
}

/**
 * Extract text content from a message content field
 * Handles both string content and array of content blocks
 * @param {string|Array} content - Message content (string or array of blocks)
 * @returns {string} Extracted text content, trimmed
 */
function extract_text_from_message_content(content) {
  if (typeof content === 'string') {
    return content.trim()
  }

  if (Array.isArray(content)) {
    const text_parts = []
    for (const block of content) {
      if (typeof block === 'string') {
        text_parts.push(block)
      } else if (block && block.type === 'text' && block.text) {
        text_parts.push(block.text)
      }
    }
    return text_parts.join(' ').trim()
  }

  return ''
}

// Messages that carry no user intent and must not be surfaced as titles or fed
// to the metadata LLM. Claude Code injects `<local-command-caveat>` and
// `<command-name>/...` wrappers around local slash commands; those strings are
// meta-chrome, not prompts.
const NON_SUBSTANTIVE_PATTERNS = [
  /^warmup$/i,
  /^test$/i,
  /^hello$/i,
  /^hi$/i,
  /^<command-name>\/\w+<\/command-name>/i,
  /^<local-command-caveat>/i,
  /^<local-command-stdout>/i,
  /^<command-message>/i
]

/**
 * Check if content represents a non-substantive message (warmup, slash
 * command, or Claude Code local-command wrapper).
 * @param {string} text - Text content to check
 * @returns {boolean} True if this is not a real user prompt
 */
function is_warmup_message(text) {
  const trimmed = text.trim()
  return NON_SUBSTANTIVE_PATTERNS.some((pattern) => pattern.test(trimmed))
}

/**
 * Extract the initial user prompt from normalized session messages
 * @param {Object} params - Parameters object
 * @param {Array} params.messages - Array of normalized session message objects
 * @returns {string|null} The content of the first substantive user message, or null if none found
 */
export function extract_initial_user_prompt_from_messages({ messages }) {
  if (!Array.isArray(messages)) {
    return null
  }

  for (const message of messages) {
    // Skip non-user messages and system/interrupt messages
    if (message.type !== 'message' || message.role !== 'user') {
      continue
    }

    // Skip meta messages (Claude Code injects caveats and local command
    // plumbing with isMeta=true; they carry no user intent).
    if (message.metadata?.is_meta) {
      continue
    }

    const text = extract_text_from_message_content(message.content)

    if (text.length === 0 || is_warmup_message(text)) {
      continue
    }

    return text
  }

  return null
}

/**
 * Generate a default thread title from a user prompt
 * @param {Object} params - Parameters object
 * @param {string} params.prompt - The user prompt text
 * @param {number} [params.max_length=100] - Maximum length for the title
 * @returns {string|null} A truncated title suitable for thread metadata, or null if prompt is empty
 */
export function generate_default_thread_title_from_prompt({
  prompt,
  max_length = 100
}) {
  if (!prompt || typeof prompt !== 'string') {
    return null
  }

  const trimmed = prompt.trim()
  if (trimmed.length === 0) {
    return null
  }

  // If within max_length, return as-is
  if (trimmed.length <= max_length) {
    return trimmed
  }

  // Truncate at word boundary
  const truncated = trimmed.substring(0, max_length)
  const last_space_index = truncated.lastIndexOf(' ')

  if (last_space_index > 0) {
    return truncated.substring(0, last_space_index) + '...'
  }

  // No space found, truncate at max_length
  return truncated + '...'
}
