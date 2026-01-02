/**
 * @fileoverview Server-side table request processing for threads
 */

import debug from 'debug'

import list_threads from '#libs-server/threads/list-threads.mjs'
import { extract_thread_metadata } from '#libs-server/threads/thread-metadata-extractor.mjs'
import { process_generic_table_request } from '#libs-server/table-processing/process-table-request.mjs'
import { DATA_TYPES } from '#libs-server/table-processing/sorting-utilities.mjs'
import { check_thread_permission_for_user } from '#server/middleware/permission/index.mjs'
import { redact_thread_data } from '#server/middleware/content-redactor.mjs'
import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'
import {
  query_threads_from_duckdb,
  count_threads_in_duckdb
} from '#libs-server/embedded-database-index/duckdb/duckdb-table-queries.mjs'
import { get_duckdb_connection } from '#libs-server/embedded-database-index/duckdb/duckdb-database-client.mjs'
import { get_models_from_cache } from '#libs-server/utils/models-cache.mjs'
import { calculate_thread_cost } from '#libs-server/utils/thread-cost-calculator.mjs'

const log = debug('threads:table')

/**
 * Normalize DuckDB thread row to match filesystem output structure
 * Adds computed fields that the filesystem path computes via extract_thread_metadata
 *
 * @param {Object} thread - DuckDB thread row
 * @param {Object} models_data - Cached models pricing data
 * @returns {Object} Normalized thread object
 */
function normalize_duckdb_thread(thread, models_data) {
  // Calculate cost using thread data and models pricing
  const cost_data = calculate_thread_cost(thread, models_data)

  return {
    // Core thread identifiers
    thread_id: thread.thread_id,

    // Title and description fields
    title: thread.title,
    short_description: thread.short_description,

    // State and status
    thread_state: thread.thread_state || 'unknown',

    // Timestamps
    created_at: thread.created_at,
    updated_at: thread.updated_at,
    duration_minutes: thread.duration_minutes || 0,

    // User information
    user_public_key: thread.user_public_key,

    // Provider and session info
    session_provider: thread.session_provider || 'base',
    inference_provider: thread.inference_provider,
    primary_model: thread.primary_model,

    // Working directory
    working_directory: thread.working_directory,
    working_directory_path: thread.working_directory_path,

    // Message and interaction counts
    message_count: thread.message_count || 0,
    user_message_count: thread.user_message_count || 0,
    assistant_message_count: thread.assistant_message_count || 0,
    tool_call_count: thread.tool_call_count || 0,

    // Token information
    total_tokens: thread.total_tokens || 0,
    total_input_tokens: thread.total_input_tokens || 0,
    total_output_tokens: thread.total_output_tokens || 0,
    cache_creation_input_tokens: thread.cache_creation_input_tokens || 0,
    cache_read_input_tokens: thread.cache_read_input_tokens || 0,

    // Cost information (calculated from models pricing)
    total_cost: cost_data.total_cost,
    input_cost: cost_data.input_cost,
    output_cost: cost_data.output_cost,
    currency: cost_data.currency,

    // Additional metadata
    description: thread.description || '',
    tags: thread.tags || []
  }
}

/**
 * Column type mapping for thread data
 */
const THREAD_COLUMN_TYPES = {
  created_at: DATA_TYPES.DATE,
  updated_at: DATA_TYPES.DATE,
  duration_ms: DATA_TYPES.NUMBER
}

/**
 * Default sorting configuration for thread tables
 */
const DEFAULT_SORT = {
  column_id: 'created_at',
  desc: true
}

/**
 * Process threads with permission checking and redaction
 *
 * @param {Array} threads - Array of thread objects
 * @param {string} requesting_user_public_key - User's public key
 * @returns {Promise<Array>} Processed threads with permissions applied
 */
async function process_threads_with_permissions(
  threads,
  requesting_user_public_key
) {
  return Promise.all(
    threads.map(async (thread) => {
      try {
        const result = await check_thread_permission_for_user({
          user_public_key: requesting_user_public_key,
          thread_id: thread.thread_id
        })
        return result.allowed ? thread : redact_thread_data(thread)
      } catch (error) {
        log(
          `Error checking permission for thread ${thread.thread_id}: ${error.message}`
        )
        return redact_thread_data(thread)
      }
    })
  )
}

/**
 * Normalize table result to unified response format
 *
 * @param {Object} result - Result from generic table processing
 * @param {Object} table_state - Original table state
 * @returns {Object} Normalized response
 */
function normalize_table_response(result, table_state) {
  return {
    rows: result.data,
    total_row_count: result.total_count,
    metadata: {
      fetched: result.data.length,
      has_more: result.has_more,
      limit: result.limit,
      offset: result.offset,
      processing_time_ms: result.processing_time_ms,
      table_state: table_state || {}
    }
  }
}

/**
 * Convert react-table filters to DuckDB format
 */
function convert_table_state_to_duckdb_filters(table_state) {
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
 * Convert react-table sort to DuckDB format
 * Handles both 'sort' and 'sorting' keys (react-table uses 'sorting')
 */
function convert_table_state_to_duckdb_sort(table_state) {
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
 * Process thread table request using DuckDB index
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

  const duckdb_connection = await get_duckdb_connection()
  const filters = convert_table_state_to_duckdb_filters(table_state)
  const sort = convert_table_state_to_duckdb_sort(table_state)
  const limit = table_state?.limit || 1000
  const offset = table_state?.offset || 0

  // Query threads from DuckDB
  const threads = await query_threads_from_duckdb({
    connection: duckdb_connection,
    filters,
    sort,
    limit,
    offset
  })

  // Get total count for pagination
  const total_count = await count_threads_in_duckdb({
    connection: duckdb_connection,
    filters
  })

  // Normalize DuckDB results to match filesystem output structure
  const normalized_threads = threads.map((thread) =>
    normalize_duckdb_thread(thread, models_data)
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
      source: 'duckdb_index'
    }
  }
}

/**
 * Process thread table request using filesystem (fallback)
 */
async function process_thread_table_request_filesystem({
  table_state,
  requesting_user_public_key
}) {
  // Get all threads from filesystem
  const all_threads = await list_threads({
    limit: Infinity,
    offset: 0
  })

  // Apply permission checking and redaction
  const threads_with_permissions = await process_threads_with_permissions(
    all_threads,
    requesting_user_public_key
  )

  // Process with generic table processor
  const result = await process_generic_table_request({
    data: threads_with_permissions,
    table_state,
    extract_metadata: extract_thread_metadata,
    default_sort: DEFAULT_SORT,
    column_types: THREAD_COLUMN_TYPES
  })

  const response = normalize_table_response(result, table_state)
  response.metadata.source = 'filesystem'
  return response
}

/**
 * Process table request with server-side filtering, sorting, and pagination
 *
 * @param {Object} params - Parameters
 * @param {Object} [params.table_state] - React-table state object (includes limit/offset)
 * @param {string} [params.requesting_user_public_key] - Requesting user's public key for permissions
 * @returns {Promise<Object>} Processed table data
 */
export async function process_thread_table_request({
  table_state,
  requesting_user_public_key
}) {
  log('Processing thread table request', {
    table_state,
    requesting_user_public_key
  })

  try {
    // Try to use indexed query if available
    if (embedded_index_manager.is_duckdb_ready()) {
      log('Using DuckDB index for thread query')
      try {
        return await process_thread_table_request_indexed({
          table_state,
          requesting_user_public_key
        })
      } catch (index_error) {
        log(
          'DuckDB index query failed, falling back to filesystem: %s',
          index_error.message
        )
      }
    }

    // Fallback to filesystem-based query
    log('Using filesystem for thread query')
    return await process_thread_table_request_filesystem({
      table_state,
      requesting_user_public_key
    })
  } catch (error) {
    log(`Error processing thread table request: ${error.message}`)
    throw error
  }
}

export default process_thread_table_request
