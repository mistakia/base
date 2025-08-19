/**
 * @fileoverview Thread metadata extraction for server-side table processing
 */

import debug from 'debug'

const log = debug('threads:metadata')

/**
 * Extract message counts (matching client-side direct field access)
 */
function extract_message_counts(thread) {
  return {
    message_count: thread.message_count || 0,
    user_message_count: thread.user_message_count || 0,
    assistant_message_count: thread.assistant_message_count || 0
  }
}

/**
 * Extract tool call count (matching client-side direct field access)
 */
function extract_tool_call_count(thread) {
  return thread.tool_call_count || 0
}

/**
 * Calculate cost data (placeholder - will integrate with existing cost calculation)
 */
function calculate_cost_data(thread) {
  // This will be integrated with existing cost calculation logic
  // For now, return placeholder structure
  return {
    total_cost: 0,
    input_cost: 0,
    output_cost: 0,
    currency: 'USD'
  }
}

/**
 * Get provider information from thread (matching client-side logic)
 */
function get_provider_info(thread) {
  // Match client-side extraction logic: session_provider or external_session.session_provider
  const session_provider =
    thread.session_provider || thread.external_session?.session_provider

  if (session_provider) {
    return { session_provider }
  }

  // Fallback to model-based detection if no session_provider
  if (thread.models && thread.models.length > 0) {
    const model = thread.models[0]
    let derived_provider = 'base'

    if (model.includes('claude')) derived_provider = 'anthropic'
    else if (model.includes('gpt')) derived_provider = 'openai'
    else if (model.includes('cursor')) derived_provider = 'cursor'

    return { session_provider: derived_provider }
  }

  return { session_provider: 'base' }
}

/**
 * Extract token count (matching client-side logic)
 */
function extract_token_count(thread) {
  return thread.external_session?.provider_metadata?.total_tokens || 0
}

/**
 * Extract duration from metadata or calculate fallback
 */
function extract_duration_minutes(thread) {
  // First try to get from provider metadata
  const duration_from_metadata =
    thread.external_session?.provider_metadata?.duration_minutes
  if (duration_from_metadata) {
    return duration_from_metadata
  }

  // Fallback calculation like client-side
  if (!thread.created_at) return 0

  const created = new Date(thread.created_at)
  const updated = thread.updated_at ? new Date(thread.updated_at) : created

  return Math.round((updated - created) / (1000 * 60)) // Duration in minutes
}

/**
 * Extract working directory (matching client-side logic)
 */
function extract_working_directory(thread) {
  const working_directory_path =
    thread.external_session?.provider_metadata?.working_directory

  if (!working_directory_path) {
    return { path: null, formatted: null }
  }

  const formatted_directory = working_directory_path.split('/').pop() || 'root'

  return {
    path: working_directory_path,
    formatted: formatted_directory
  }
}

/**
 * Extract thread title with fallback to working directory
 */
function extract_thread_title(thread) {
  // Return title if available
  if (thread.title) {
    return thread.title
  }

  return null
}

/**
 * Extract thread description
 */
function extract_thread_description(thread) {
  return thread.short_description || null
}

/**
 * Format thread metadata for table display
 */
function format_for_table_display(thread, extracted_data) {
  const {
    message_counts,
    cost_data,
    provider_info,
    working_directory,
    duration_minutes,
    token_count,
    tool_call_count,
    title,
    description
  } = extracted_data

  return {
    // Core thread identifiers
    thread_id: thread.thread_id,

    // Title and description fields
    title,
    short_description: description,

    // State and status
    thread_state: thread.thread_state || 'unknown',

    // Timestamps
    created_at: thread.created_at,
    updated_at: thread.updated_at,
    duration_minutes,

    // User information
    user_public_key: thread.user_public_key,

    // Provider and session info (matching client-side fields)
    ...provider_info,

    // Working directory
    working_directory: working_directory.formatted,
    working_directory_path: working_directory.path,

    // Message and interaction counts (matching client-side field names)
    ...message_counts,
    tool_call_count,

    // Token and cost information
    token_count,
    ...cost_data,

    // Additional metadata
    description: thread.description || '',
    tags: thread.tags || [],

    // Raw thread data for navigation and detailed views
    raw_thread: thread
  }
}

/**
 * Extract thread metadata for server-side processing
 *
 * @param {Object} thread Raw thread object from filesystem
 * @returns {Promise<Object>} Formatted thread data for table display
 */
export async function extract_thread_metadata(thread) {
  try {
    log(`Extracting metadata for thread ${thread.thread_id}`)

    // Extract all relevant data using client-side matching patterns
    const extracted_data = {
      message_counts: extract_message_counts(thread),
      tool_call_count: extract_tool_call_count(thread),
      token_count: extract_token_count(thread),
      duration_minutes: extract_duration_minutes(thread),
      working_directory: extract_working_directory(thread),
      cost_data: calculate_cost_data(thread),
      provider_info: get_provider_info(thread),
      title: extract_thread_title(thread),
      description: extract_thread_description(thread)
    }

    // Format for table display
    const formatted_thread = format_for_table_display(thread, extracted_data)

    log(`Metadata extracted for thread ${thread.thread_id}`)
    return formatted_thread
  } catch (error) {
    log(
      `Error extracting metadata for thread ${thread.thread_id}: ${error.message}`
    )

    // Return minimal data structure on error
    return {
      thread_id: thread.thread_id || 'unknown',
      title: 'Error Loading Thread',
      short_description: null,
      thread_state: 'error',
      created_at: thread.created_at || null,
      updated_at: thread.updated_at || null,
      duration_minutes: 0,
      user_public_key: thread.user_public_key || null,
      session_provider: 'base',
      working_directory: null,
      working_directory_path: null,
      message_count: 0,
      user_message_count: 0,
      assistant_message_count: 0,
      tool_call_count: 0,
      token_count: 0,
      total_cost: 0,
      input_cost: 0,
      output_cost: 0,
      currency: 'USD',
      tags: [],
      raw_thread: thread
    }
  }
}

export default extract_thread_metadata
