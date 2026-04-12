// Shared utility functions for extracting thread metadata
// Used by ThreadsTable and ThreadHeader components

/**
 * Extract message counts from thread metadata
 * @param {Object} thread - Thread object (can be Immutable or plain JS)
 * @returns {Object} Object with message counts
 */
export const extract_message_counts = (thread) => {
  if (!thread) {
    return {
      message_count: 0,
      user_message_count: 0,
      assistant_message_count: 0
    }
  }

  // Handle both Immutable and plain JS objects
  const get_value = (obj, path) => {
    if (obj.get) {
      // Immutable object
      return obj.get(path) || 0
    } else {
      // Plain JS object
      return obj[path] || 0
    }
  }

  return {
    message_count: get_value(thread, 'message_count'),
    user_message_count: get_value(thread, 'user_message_count'),
    assistant_message_count: get_value(thread, 'assistant_message_count')
  }
}

/**
 * Extract tool call count from thread metadata
 * @param {Object} thread - Thread object (can be Immutable or plain JS)
 * @returns {number} Tool call count
 */
export const extract_tool_call_count = (thread) => {
  if (!thread) return 0

  if (thread.get) {
    // Immutable object
    return thread.get('tool_call_count') || 0
  } else {
    // Plain JS object
    return thread.tool_call_count || 0
  }
}

/**
 * Extract token count from thread metadata
 * @param {Object} thread - Thread object (can be Immutable or plain JS)
 * @returns {number} Total token count
 */
export const extract_total_tokens = (thread) => {
  if (!thread) return 0

  if (thread.get) {
    return thread.getIn(['source', 'provider_metadata', 'total_tokens']) || 0
  } else {
    return thread.source?.provider_metadata?.total_tokens || 0
  }
}

/**
 * Extract duration from thread metadata
 * @param {Object} thread - Thread object (can be Immutable or plain JS)
 * @returns {string|null} Formatted duration string
 */
export const extract_duration = (thread) => {
  if (!thread) return null

  let duration_minutes

  if (thread.get) {
    duration_minutes = thread.getIn([
      'source',
      'provider_metadata',
      'duration_minutes'
    ])
  } else {
    duration_minutes = thread.source?.provider_metadata?.duration_minutes
  }

  if (!duration_minutes) return null

  if (duration_minutes < 1) {
    return `${Math.round(duration_minutes * 60)}s`
  } else if (duration_minutes < 60) {
    return `${Math.round(duration_minutes)}m`
  } else {
    const hours = Math.floor(duration_minutes / 60)
    const minutes = Math.round(duration_minutes % 60)
    return `${hours}h ${minutes}m`
  }
}

/**
 * Extract working directory from thread metadata
 * @param {Object} thread - Thread object (can be Immutable or plain JS)
 * @returns {Object} Object with full path and formatted directory name
 */
export const extract_working_directory = (thread) => {
  if (!thread) return { path: null, formatted: '—' }

  let working_directory_path

  if (thread.get) {
    working_directory_path = thread.getIn([
      'source',
      'provider_metadata',
      'working_directory'
    ])
  } else {
    working_directory_path = thread.source?.provider_metadata?.working_directory
  }

  if (!working_directory_path) {
    return { path: null, formatted: '—' }
  }

  const formatted_directory = working_directory_path.split('/').pop() || 'root'

  return {
    path: working_directory_path,
    formatted: formatted_directory
  }
}

/**
 * Extract session provider from thread metadata
 * @param {Object} thread - Thread object (can be Immutable or plain JS)
 * @returns {string|null} Session provider name
 */
export const extract_session_provider = (thread) => {
  if (!thread) return null

  if (thread.get) {
    return thread.getIn(['source', 'provider']) || null
  } else {
    return thread.source?.provider || null
  }
}

/**
 * Extract thread state from thread metadata
 * @param {Object} thread - Thread object (can be Immutable or plain JS)
 * @returns {string|null} Thread state
 */
export const extract_thread_state = (thread) => {
  if (!thread) return null

  if (thread.get) {
    // Immutable object
    return thread.get('thread_state')
  } else {
    // Plain JS object
    return thread.thread_state
  }
}

/**
 * Extract thread title with fallback to working directory
 * @param {Object} thread - Thread object (can be Immutable or plain JS)
 * @returns {string} Thread title or fallback
 */
export const extract_thread_title = (thread) => {
  if (!thread) return 'Untitled Thread'

  let title
  if (thread.get) {
    // Immutable object
    title = thread.get('title')
  } else {
    // Plain JS object
    title = thread.title
  }

  // Return title if available
  if (title) {
    return title
  }

  // Fallback to prompt snippet
  const prompt_snippet = thread.get
    ? thread.get('prompt_snippet')
    : thread.prompt_snippet
  if (prompt_snippet) {
    return prompt_snippet
  }

  // Fallback to working directory basename
  const working_directory = extract_working_directory(thread)
  if (working_directory.formatted && working_directory.formatted !== '—') {
    return working_directory.formatted
  }

  return 'Untitled Thread'
}

/**
 * Extract thread description
 * @param {Object} thread - Thread object (can be Immutable or plain JS)
 * @returns {string|null} Thread description
 */
export const extract_thread_description = (thread) => {
  if (!thread) return null

  if (thread.get) {
    // Immutable object
    return thread.get('short_description') || null
  } else {
    // Plain JS object
    return thread.short_description || null
  }
}

/**
 * Extract tags from thread metadata
 * @param {Object} thread - Thread object (can be Immutable or plain JS)
 * @returns {Array} Array of tag base_uris
 */
export const extract_tags = (thread) => {
  if (!thread) return []

  let tags
  if (thread.get) {
    tags = thread.get('tags')
    if (tags && tags.toJS) {
      tags = tags.toJS()
    }
  } else {
    tags = thread.tags
  }

  return Array.isArray(tags) ? tags : []
}

/**
 * Extract user public key from thread metadata
 * @param {Object} thread - Thread object (can be Immutable or plain JS)
 * @returns {string|null} User public key or null
 */
export const extract_user_public_key = (thread) => {
  if (!thread) return null

  if (thread.get) {
    // Immutable object
    return thread.get('user_public_key') || null
  } else {
    // Plain JS object
    return thread.user_public_key || null
  }
}
