/**
 * Thread Data Extractor
 *
 * Extract indexable data from thread metadata for database sync.
 */

import path from 'path'
import debug from 'debug'

import { get_thread_base_directory } from '#libs-server/threads/threads-constants.mjs'
import {
  extract_timeline_metrics_streaming,
  accumulate_edit_metrics_from_event
} from '#libs-server/threads/timeline/index.mjs'

const log = debug('embedded-index:sync:thread')

/**
 * Default return value when no latest event data is available
 */
const NULL_LATEST_EVENT = {
  latest_event_timestamp: null,
  latest_event_type: null,
  latest_event_data: null
}

/**
 * Default return value when no edit metrics are available
 */
const NULL_EDIT_METRICS = {
  edit_count: 0,
  lines_changed: 0
}

/**
 * Extract edit metrics from a timeline
 * Counts Edit and Write tool results and estimates lines changed.
 * Only counts tool_result events (not tool_use requests) to avoid double-counting.
 * @param {Object} params Parameters
 * @param {Array} params.timeline Timeline array of events
 * @returns {Object} Object with edit_count and lines_changed
 */
export function extract_edit_metrics_from_timeline({ timeline }) {
  if (!timeline || timeline.length === 0) {
    return NULL_EDIT_METRICS
  }

  const state = { edit_count: 0, total_chars_changed: 0 }

  for (const event of timeline) {
    accumulate_edit_metrics_from_event(event, state)
  }

  // Convert chars to approximate lines (80 chars per line)
  const lines_changed = Math.ceil(state.total_chars_changed / 80)

  return {
    edit_count: state.edit_count,
    lines_changed
  }
}

/**
 * Extract the latest non-system event from a timeline array
 * @param {Object} params Parameters
 * @param {Array} params.timeline Timeline array of events
 * @returns {Object|null} Latest non-system event or null if none found
 */
export function extract_latest_event_from_timeline({ timeline }) {
  if (!timeline || timeline.length === 0) {
    return null
  }

  // Find the last non-system event
  for (let i = timeline.length - 1; i >= 0; i--) {
    const event = timeline[i]
    if (event.type !== 'system') {
      return event
    }
  }

  return null
}

/**
 * Read timeline and extract latest event for a given thread.
 * Uses streaming extraction to avoid loading full timeline into memory.
 * @param {Object} params Parameters
 * @param {string} params.thread_id Thread ID
 * @param {string} [params.user_base_directory] Custom user base directory
 * @returns {Promise<Object>} Object with latest_event_timestamp, latest_event_type, latest_event_data, edit_count, lines_changed
 */
export async function read_and_extract_latest_event({
  thread_id,
  user_base_directory
}) {
  try {
    const thread_base_directory = get_thread_base_directory({
      user_base_directory
    })
    const timeline_path = path.join(
      thread_base_directory,
      thread_id,
      'timeline.jsonl'
    )

    // Use streaming extraction to avoid memory pressure during rebuild
    const metrics = await extract_timeline_metrics_streaming({ timeline_path })

    if (!metrics.latest_event) {
      return {
        ...NULL_LATEST_EVENT,
        edit_count: metrics.edit_count,
        lines_changed: metrics.lines_changed,
        tools_used: metrics.tools_used,
        bash_commands_used: metrics.bash_commands_used,
        models: metrics.models
      }
    }

    return {
      latest_event_timestamp: metrics.latest_event.timestamp || null,
      latest_event_type: metrics.latest_event.type || null,
      latest_event_data: JSON.stringify(metrics.latest_event),
      edit_count: metrics.edit_count,
      lines_changed: metrics.lines_changed,
      tools_used: metrics.tools_used,
      bash_commands_used: metrics.bash_commands_used,
      models: metrics.models
    }
  } catch (error) {
    log('Error reading timeline for thread %s: %s', thread_id, error.message)
    return {
      ...NULL_LATEST_EVENT,
      ...NULL_EDIT_METRICS
    }
  }
}

export function extract_thread_index_data({ thread_id, metadata }) {
  if (!thread_id || !metadata) {
    return null
  }

  const provider_metadata = metadata.source?.provider_metadata || {}

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

  const source_provider = metadata.source?.provider || null
  const external_session_id = metadata.source?.session_id || null

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

  // Extract file and directory references as JSON text
  const file_references = Array.isArray(metadata.file_references)
    ? JSON.stringify(metadata.file_references)
    : null
  const directory_references = Array.isArray(metadata.directory_references)
    ? JSON.stringify(metadata.directory_references)
    : null

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
    source_provider,
    inference_provider,
    primary_model,
    user_public_key: metadata.user_public_key || null,
    edit_count: metadata.edit_count || 0,
    lines_changed: metadata.lines_changed || 0,
    file_references,
    directory_references,
    public_read: metadata.public_read != null ? metadata.public_read : null,
    visibility_analyzed_at: metadata.visibility_analyzed_at || null,
    archived_at: metadata.archived_at || null,
    archive_reason: metadata.archive_reason || null,
    external_session_id,
    has_continuation_prompt:
      typeof metadata.has_continuation_prompt === 'boolean'
        ? metadata.has_continuation_prompt
        : null,
    continuation_prompt_count:
      typeof metadata.continuation_prompt_count === 'number'
        ? metadata.continuation_prompt_count
        : null
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
