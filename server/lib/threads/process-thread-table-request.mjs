/**
 * @fileoverview Server-side table request processing for threads
 */

import debug from 'debug'

import { check_thread_permission_for_user } from '#server/middleware/permission/index.mjs'
import { redact_thread_data } from '#server/middleware/content-redactor.mjs'
import { parse_latest_timeline_event_data } from '#libs-server/threads/thread-utils.mjs'
import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'

import { get_models_from_cache } from '#libs-server/utils/models-cache.mjs'
import { calculate_thread_cost } from '#libs-server/utils/thread-cost-calculator.mjs'
import { to_number } from '#libs-server/utils/to-number.mjs'

const log = debug('threads:table')

/**
 * Normalize SQLite thread row to match filesystem output structure
 * Adds computed fields that the filesystem path computes via extract_thread_metadata
 *
 * @param {Object} thread - SQLite thread row
 * @param {Object} models_data - Cached models pricing data
 * @returns {Object} Normalized thread object
 */
export function normalize_sqlite_thread(thread, models_data) {
  // Calculate cost using thread data and models pricing
  const cost_data = calculate_thread_cost(thread, models_data)

  // Parse latest timeline event from SQLite columns
  const latest_timeline_event = parse_latest_timeline_event_data({
    latest_event_data: thread.latest_event_data,
    thread_id: thread.thread_id
  })

  return {
    // Core thread identifiers
    thread_id: thread.thread_id,

    // Title and description fields
    title: thread.title,
    short_description: thread.short_description,

    // State and status
    thread_state: thread.thread_state || 'unknown',
    archived_at: thread.archived_at || null,
    archive_reason: thread.archive_reason || null,

    // Timestamps
    created_at: thread.created_at,
    updated_at: thread.updated_at,
    duration_minutes: to_number(thread.duration_minutes),

    // User information
    user_public_key: thread.user_public_key,

    // Provider and session info
    source_provider: thread.source_provider || null,
    inference_provider: thread.inference_provider,
    primary_model: thread.primary_model,
    models:
      thread.models || (thread.primary_model ? [thread.primary_model] : []),

    // Working directory
    working_directory: thread.working_directory,
    working_directory_path: thread.working_directory_path,

    // Message and interaction counts (convert BigInt from SQLite)
    message_count: to_number(thread.message_count),
    user_message_count: to_number(thread.user_message_count),
    assistant_message_count: to_number(thread.assistant_message_count),
    tool_call_count: to_number(thread.tool_call_count),

    // Token information (convert BigInt from SQLite)
    total_tokens: to_number(thread.total_tokens),
    context_input_tokens: to_number(thread.context_input_tokens),
    context_cache_creation_input_tokens: to_number(
      thread.context_cache_creation_input_tokens
    ),
    context_cache_read_input_tokens: to_number(
      thread.context_cache_read_input_tokens
    ),
    cumulative_input_tokens: to_number(thread.cumulative_input_tokens),
    cumulative_output_tokens: to_number(thread.cumulative_output_tokens),
    cumulative_cache_creation_input_tokens: to_number(
      thread.cumulative_cache_creation_input_tokens
    ),
    cumulative_cache_read_input_tokens: to_number(
      thread.cumulative_cache_read_input_tokens
    ),

    // Cost information (calculated from models pricing)
    total_cost: cost_data.total_cost,
    input_cost: cost_data.input_cost,
    output_cost: cost_data.output_cost,
    currency: cost_data.currency,

    // Latest timeline event (from SQLite index)
    latest_timeline_event,

    // External session identifier
    external_session_id: thread.external_session_id || null,

    // Additional metadata
    description: thread.description || '',
    tags: thread.tags_aggregated
      ? thread.tags_aggregated.split('||').filter(Boolean)
      : []
  }
}

const DEFAULT_SORT = {
  column_id: 'created_at',
  desc: true
}

/**
 * Convert react-table filters to SQLite format
 */
function convert_table_state_to_sqlite_filters(table_state) {
  const filters = []

  if (table_state?.where) {
    for (const filter of table_state.where) {
      if (filter.column_id && filter.operator) {
        filters.push({
          column_id: filter.column_id,
          operator: filter.operator,
          value: filter.value
        })
      }
    }
  }

  return filters
}

/**
 * Convert react-table sort to SQLite format
 * Handles both 'sort' and 'sorting' keys (react-table uses 'sorting')
 */
function convert_table_state_to_sqlite_sort(table_state) {
  const sort = []

  // Check for both 'sort' and 'sorting' (react-table format uses 'sorting')
  const sort_config = table_state?.sort || table_state?.sorting

  if (sort_config) {
    for (const sort_item of sort_config) {
      sort.push({
        column_id: sort_item.column_id || sort_item.id,
        desc: sort_item.desc || false
      })
    }
  }

  // Apply default sort if no sort specified
  if (sort.length === 0) {
    sort.push(DEFAULT_SORT)
  }

  return sort
}

/**
 * Process thread table request using SQLite index
 */
async function process_thread_table_request_indexed({
  table_state,
  requesting_user_public_key
}) {
  const start_time = Date.now()

  // Fetch models data for cost calculation (non-blocking on failure)
  let models_data = null
  try {
    const cache_data = await get_models_from_cache()
    models_data = cache_data?.models || null
  } catch (error) {
    log('Failed to fetch models data for cost calculation: %s', error.message)
  }

  const all_filters = convert_table_state_to_sqlite_filters(table_state)
  const sort = convert_table_state_to_sqlite_sort(table_state)
  const limit = table_state?.limit || 1000
  const offset = table_state?.offset || 0

  // Separate tag filters from regular column filters.
  // Tags are stored in the thread_tags join table, not as a column on threads,
  // so they must be passed via the dedicated `tags` parameter.
  const tag_filters = all_filters.filter((f) => f.column_id === 'tags')
  const filters = all_filters.filter((f) => f.column_id !== 'tags')

  // Extract tag values from IN filters
  const tags = tag_filters.reduce((acc, f) => {
    if (f.operator === 'IN' && Array.isArray(f.value)) {
      acc.push(...f.value)
    }
    return acc
  }, [])

  // Query threads via manager (delegates to active backend)
  const threads = await embedded_index_manager.query_threads({
    filters,
    sort,
    limit,
    offset,
    tags: tags.length > 0 ? tags : undefined
  })

  // Get total count for pagination
  const total_count = await embedded_index_manager.count_threads({
    filters,
    tags: tags.length > 0 ? tags : undefined
  })

  // Normalize SQLite results to match filesystem output structure
  const normalized_threads = threads.map((thread) =>
    normalize_sqlite_thread(thread, models_data)
  )

  // Apply permissions and redaction
  const threads_with_permissions = await Promise.all(
    normalized_threads.map(async (thread) => {
      try {
        const result = await check_thread_permission_for_user({
          user_public_key: requesting_user_public_key,
          thread_id: thread.thread_id
        })
        return result.allowed
          ? { ...thread, is_redacted: false }
          : redact_thread_data(thread)
      } catch (error) {
        log(
          `Error checking permission for thread ${thread.thread_id}: ${error.message}`
        )
        return redact_thread_data(thread)
      }
    })
  )

  const processing_time_ms = Date.now() - start_time

  return {
    rows: threads_with_permissions,
    total_row_count: total_count,
    metadata: {
      fetched: threads_with_permissions.length,
      has_more: offset + threads_with_permissions.length < total_count,
      limit,
      offset,
      processing_time_ms,
      table_state: table_state || {},
      source: 'sqlite_index'
    }
  }
}

/**
 * Process table request with server-side filtering, sorting, and pagination
 */
export async function process_thread_table_request({
  table_state,
  requesting_user_public_key
}) {
  log('Processing thread table request', {
    table_state,
    requesting_user_public_key
  })

  return process_thread_table_request_indexed({
    table_state,
    requesting_user_public_key
  })
}

export default process_thread_table_request
