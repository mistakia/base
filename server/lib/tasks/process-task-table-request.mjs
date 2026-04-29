/**
 * @fileoverview Server-side table request processing for tasks
 */

import debug from 'debug'
import { check_permissions_batch } from '#server/middleware/permission/index.mjs'
import { redact_entity_object } from '#server/middleware/content-redactor.mjs'
import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'
import { resolve_table_search } from '#libs-server/table/search-filter.mjs'
import { apply_tag_redaction_to_tasks } from './tag-visibility.mjs'

const log = debug('tasks:table')

/**
 * Normalize task for table API response
 * Applies default values and adds filesystem-compat fields (absolute_path, content_preview)
 * to ensure consistent output structure between SQLite and filesystem query paths
 */
function normalize_task_for_table_response(task, defaults) {
  return {
    // Basic properties with fallback defaults
    entity_id: task.entity_id,
    base_uri: task.base_uri,
    title: task.title || defaults.title,
    status: task.status || defaults.status,
    priority: task.priority || defaults.priority,
    description: task.description || defaults.description,
    created_at: task.created_at,
    updated_at: task.updated_at,
    user_public_key: task.user_public_key,

    // Timing properties
    start_by: task.start_by,
    finish_by: task.finish_by,
    planned_start: task.planned_start,
    planned_finish: task.planned_finish,
    started_at: task.started_at,
    finished_at: task.finished_at,
    snooze_until: task.snooze_until,

    // Duration properties
    estimated_total_duration: task.estimated_total_duration,

    // Metadata with defaults
    archived: task.archived || defaults.archived,
    relations: task.relations || [],
    tags: task.tags || [],

    // File info - absolute_path not available from SQLite index (only base_uri is stored)
    absolute_path: null,
    content_preview: ''
  }
}

const CONFIG = {
  // Redaction configuration
  redaction: {
    preserved_keys: ['type', 'entity_type', 'status', 'priority', 'archived'],
    redacted_keys: [
      'title',
      'description',
      'content_preview',
      'user_public_key'
    ]
  },

  // Default values
  defaults: {
    title: 'Untitled',
    status: 'No status',
    priority: 'None',
    description: '',
    archived: false
  },

  // Table configuration
  table: {
    default_sort: { column_id: 'created_at', desc: true },
    content_preview_length: 200
  }
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
    sort.push(CONFIG.table.default_sort)
  }

  return sort
}

/**
 * Process task table request using SQLite index (via entities table)
 */
async function process_task_table_request_indexed({
  table_state,
  requesting_user_public_key
}) {
  const start_time = Date.now()

  const filters = convert_table_state_to_sqlite_filters(table_state)
  const sort = convert_table_state_to_sqlite_sort(table_state)
  const limit = table_state?.limit || 1000
  const offset = table_state?.offset || 0

  // Resolve quick-search query (table_state.q) into a base_uri IN filter and
  // per-row highlight map. Sub-3-character or missing queries no-op.
  const search_result = await resolve_table_search({
    q: table_state?.q,
    entity_type: 'task',
    requesting_user_public_key
  })

  let row_highlights_response = {}
  if (search_result) {
    if (search_result.uri_set_as_row_keys.length === 0) {
      const processing_time_ms = Date.now() - start_time
      return {
        rows: [],
        total_row_count: 0,
        row_highlights: {},
        tag_visibility: {},
        metadata: {
          fetched: 0,
          has_more: false,
          limit,
          offset,
          processing_time_ms,
          table_state: table_state || {},
          source: 'sqlite_index'
        }
      }
    }
    filters.push({
      column_id: 'base_uri',
      operator: 'IN',
      value: search_result.uri_set_as_row_keys
    })
    row_highlights_response = Object.fromEntries(search_result.row_highlights)
  }

  // Query tasks via manager (delegates to active backend)
  const tasks = await embedded_index_manager.query_tasks({
    filters,
    sort,
    limit,
    offset
  })

  // Get total count for pagination
  const total_count = await embedded_index_manager.count_tasks({
    filters
  })

  // Normalize results to match filesystem output structure
  const normalized_tasks = tasks.map((task) =>
    normalize_task_for_table_response(task, CONFIG.defaults)
  )

  // Collect all base_uri values for batch permission checking
  const resource_paths = normalized_tasks
    .map((task) => task.base_uri)
    .filter(Boolean)

  // Batch check permissions for all tasks at once (more efficient)
  const permissions_by_path = await check_permissions_batch({
    user_public_key: requesting_user_public_key,
    resource_paths
  })

  // Apply task-level permissions, redaction, and can_write flag
  const redacted_tasks = normalized_tasks.map((task) => {
    const permission = permissions_by_path[task.base_uri]

    if (permission?.read?.allowed) {
      return {
        ...task,
        is_redacted: false,
        can_write: permission?.write?.allowed || false
      }
    }

    // User lacks read permission - redact the task
    const redacted = redact_entity_object(task, {
      preserve_keys: CONFIG.redaction.preserved_keys,
      redact_keys: CONFIG.redaction.redacted_keys
    })
    return { ...redacted, can_write: false }
  })

  // Apply tag-level redaction (redact non-visible tag URIs)
  const { tasks: final_tasks, tag_visibility } =
    await apply_tag_redaction_to_tasks({
      tasks: redacted_tasks,
      user_public_key: requesting_user_public_key
    })

  const processing_time_ms = Date.now() - start_time

  return {
    rows: final_tasks,
    total_row_count: total_count,
    tag_visibility,
    row_highlights: row_highlights_response,
    metadata: {
      fetched: final_tasks.length,
      has_more: offset + final_tasks.length < total_count,
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
export async function process_task_table_request({
  table_state,
  requesting_user_public_key
}) {
  log('Processing task table request', {
    table_state,
    requesting_user_public_key
  })

  return process_task_table_request_indexed({
    table_state,
    requesting_user_public_key
  })
}

export default process_task_table_request
