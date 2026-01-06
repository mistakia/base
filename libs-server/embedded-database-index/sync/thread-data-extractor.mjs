/**
 * Thread Data Extractor
 *
 * Extract indexable data from thread metadata for database sync.
 */

import debug from 'debug'

const log = debug('embedded-index:sync:thread')

export function extract_thread_index_data({ thread_id, metadata }) {
  if (!thread_id || !metadata) {
    return null
  }

  // Get provider metadata from external_session if available
  const provider_metadata = metadata.external_session?.provider_metadata || {}

  // Extract token counts - check multiple locations
  const total_input_tokens =
    metadata.input_tokens || provider_metadata.input_tokens || null
  const total_output_tokens =
    metadata.output_tokens || provider_metadata.output_tokens || null
  const cache_creation_input_tokens =
    metadata.cache_creation_input_tokens ||
    provider_metadata.cache_creation_input_tokens ||
    null
  const cache_read_input_tokens =
    metadata.cache_read_input_tokens ||
    provider_metadata.cache_read_input_tokens ||
    null
  const total_tokens = provider_metadata.total_tokens || null

  // Calculate duration
  let duration_ms = null
  let duration_minutes = null

  // First try provider metadata duration
  if (provider_metadata.duration_minutes) {
    duration_minutes = provider_metadata.duration_minutes
    duration_ms = Math.round(duration_minutes * 60 * 1000)
  } else if (metadata.created_at && metadata.updated_at) {
    // Fallback to calculating from timestamps
    const created = new Date(metadata.created_at).getTime()
    const updated = new Date(metadata.updated_at).getTime()
    if (!isNaN(created) && !isNaN(updated)) {
      duration_ms = updated - created
      duration_minutes = duration_ms / (1000 * 60)
    }
  }

  // Extract working directory - check nested path first
  const working_directory_path =
    provider_metadata.working_directory ||
    metadata.working_directory ||
    metadata.cwd ||
    null

  // Format working directory (last path segment)
  const working_directory = working_directory_path
    ? working_directory_path.split('/').pop() || 'root'
    : null

  // Extract session provider
  const session_provider =
    metadata.session_provider ||
    metadata.external_session?.session_provider ||
    provider_metadata.session_provider ||
    metadata.inference_provider ||
    null

  // Extract inference provider (for cost calculation)
  const inference_provider = metadata.inference_provider || null

  // Extract primary model (first model used, for cost calculation)
  const primary_model =
    (metadata.models && metadata.models[0]) ||
    (provider_metadata.models && provider_metadata.models[0]) ||
    null

  // Extract tool call count
  const tool_call_count = metadata.tool_call_count || null

  // Extract short description
  const short_description = metadata.short_description || null

  return {
    thread_id,
    title: metadata.title || null,
    short_description,
    thread_state: metadata.thread_state || metadata.state || 'active',
    created_at: metadata.created_at || null,
    updated_at: metadata.updated_at || null,
    message_count: metadata.message_count || null,
    user_message_count: metadata.user_message_count || null,
    assistant_message_count: metadata.assistant_message_count || null,
    tool_call_count,
    total_input_tokens,
    total_output_tokens,
    cache_creation_input_tokens,
    cache_read_input_tokens,
    total_tokens,
    duration_ms,
    duration_minutes,
    working_directory,
    working_directory_path,
    session_provider,
    inference_provider,
    primary_model,
    user_public_key: metadata.user_public_key || null
  }
}

export function extract_thread_metadata_from_file({
  thread_id,
  metadata_json
}) {
  // Parse metadata.json content if provided as string
  let metadata = metadata_json
  if (typeof metadata_json === 'string') {
    try {
      metadata = JSON.parse(metadata_json)
    } catch (error) {
      log('Error parsing thread metadata JSON: %s', error.message)
      return null
    }
  }

  return extract_thread_index_data({ thread_id, metadata })
}

/**
 * Extract thread data in entity format for Kuzu
 * Returns data suitable for upserting as an Entity node with type 'thread'
 */
export function extract_thread_entity_data({ thread_id, metadata }) {
  if (!thread_id || !metadata) {
    return null
  }

  return {
    thread_id,
    title: metadata.title || null,
    created_at: metadata.created_at || null,
    updated_at: metadata.updated_at || null,
    user_public_key: metadata.user_public_key || null
  }
}

/**
 * Extract thread relations in Kuzu edge format
 * Parses the metadata.relations array and returns structured relation objects
 */
export function extract_thread_relations_for_kuzu({ metadata }) {
  if (!metadata || !metadata.relations) {
    return []
  }

  const relations = []

  for (const relation_string of metadata.relations) {
    // Relations are stored as strings like "relates_to [[user:task/some-task.md]]"
    // or "implements [[sys:system/schema/task.md]]"
    const match = relation_string.match(/^(\w+)\s+\[\[([^\]]+)\]\]$/)
    if (match) {
      const relation_type = match[1]
      const target_base_uri = match[2]
      relations.push({
        target_base_uri,
        relation_type,
        context: ''
      })
    }
  }

  return relations
}
