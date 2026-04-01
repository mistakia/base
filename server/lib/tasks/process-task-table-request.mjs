/**
 * @fileoverview Server-side table request processing for tasks
 */

import debug from 'debug'
import { list_tasks_from_filesystem } from '#libs-server/task/filesystem/list-tasks-from-filesystem.mjs'
import { process_generic_table_request } from '#libs-server/table-processing/process-table-request.mjs'
import { TABLE_DATA_TYPES } from 'react-table/src/constants.mjs'
import { check_permissions_batch } from '#server/middleware/permission/index.mjs'
import { redact_entity_object } from '#server/middleware/content-redactor.mjs'
import { TASK_PRIORITY_ORDER } from '#libs-shared/task-constants.mjs'
import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'
import {
  query_tasks_from_entities,
  count_tasks_from_entities
} from '#libs-server/embedded-database-index/sqlite/sqlite-table-queries.mjs'
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

// Configuration constants
const CONFIG = {
  // Column type mapping for task data
  column_types: {
    created_at: TABLE_DATA_TYPES.DATE,
    updated_at: TABLE_DATA_TYPES.DATE,
    start_by: TABLE_DATA_TYPES.DATE,
    finish_by: TABLE_DATA_TYPES.DATE,
    planned_start: TABLE_DATA_TYPES.DATE,
    planned_finish: TABLE_DATA_TYPES.DATE,
    started_at: TABLE_DATA_TYPES.DATE,
    finished_at: TABLE_DATA_TYPES.DATE,
    snooze_until: TABLE_DATA_TYPES.DATE,
    estimated_total_duration: TABLE_DATA_TYPES.NUMBER,
    estimated_preparation_duration: TABLE_DATA_TYPES.NUMBER,
    estimated_execution_duration: TABLE_DATA_TYPES.NUMBER,
    estimated_cleanup_duration: TABLE_DATA_TYPES.NUMBER,
    actual_duration: TABLE_DATA_TYPES.NUMBER
  },

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
 * Extract task properties with fallback values
 */
function extract_task_properties(entity_properties) {
  const { defaults } = CONFIG

  return {
    // Basic properties
    entity_id: entity_properties.entity_id,
    title: entity_properties.title || defaults.title,
    status: entity_properties.status || defaults.status,
    priority: entity_properties.priority || defaults.priority,
    description: entity_properties.description || defaults.description,
    created_at: entity_properties.created_at,
    updated_at: entity_properties.updated_at,
    user_public_key: entity_properties.user_public_key,

    // Timing properties
    start_by: entity_properties.start_by,
    finish_by: entity_properties.finish_by,
    planned_start: entity_properties.planned_start,
    planned_finish: entity_properties.planned_finish,
    started_at: entity_properties.started_at,
    finished_at: entity_properties.finished_at,
    snooze_until: entity_properties.snooze_until,

    // Duration properties
    estimated_total_duration: entity_properties.estimated_total_duration,
    estimated_preparation_duration:
      entity_properties.estimated_preparation_duration,
    estimated_execution_duration:
      entity_properties.estimated_execution_duration,
    estimated_cleanup_duration: entity_properties.estimated_cleanup_duration,
    actual_duration: entity_properties.actual_duration,

    // Metadata
    assigned_to: entity_properties.assigned_to,
    archived: entity_properties.archived || defaults.archived,
    relations: entity_properties.relations || [],
    tags: entity_properties.tags || []
  }
}

/**
 * Extract file information and content preview
 */
function extract_file_info(task_entity) {
  const { absolute_path, file_info, entity_content } = task_entity
  const { content_preview_length } = CONFIG.table

  return {
    absolute_path: absolute_path || file_info?.absolute_path,
    base_uri: file_info?.base_uri,
    content_preview: entity_content
      ? entity_content.substring(0, content_preview_length) + '...'
      : ''
  }
}

/**
 * Process task entity for table display
 */
function process_task_for_table(task_entity) {
  const { entity_properties, is_redacted, can_write } = task_entity

  const properties = extract_task_properties(entity_properties)
  const file_info = extract_file_info(task_entity)

  return {
    ...properties,
    ...file_info,
    is_redacted: is_redacted || false,
    can_write: can_write !== false
  }
}

/**
 * Process all tasks with batch permission checking
 * Uses check_permissions_batch for efficiency and returns both read/write permissions
 */
async function process_tasks_with_permissions(tasks, user_public_key) {
  // Collect base_uris for batch permission checking
  const resource_paths = tasks
    .map((task) => task.entity_properties?.base_uri)
    .filter(Boolean)

  // Batch check permissions for all tasks at once
  const permissions_by_path = await check_permissions_batch({
    user_public_key,
    resource_paths
  })

  // Apply permissions, redaction, and can_write flag to each task
  return tasks.map((task) => {
    const base_uri = task.entity_properties?.base_uri
    const permission = base_uri ? permissions_by_path[base_uri] : null

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
}

/**
 * Normalize table response format
 */
function normalize_response(result, table_state) {
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
 * Custom get_value function for task table that handles priority sorting
 * Maps priority strings to numeric order for proper sorting
 */
function get_task_value_for_sorting(item, column_id) {
  const value = item[column_id]

  // Special handling for priority column to use semantic ordering
  if (column_id === 'priority') {
    // Map priority string to numeric order (higher number = higher priority)
    // This ensures Critical > High > Medium > Low > None
    return TASK_PRIORITY_ORDER[value] ?? 0
  }

  // For all other columns, return the value as-is
  return value
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

  // Query tasks from entities table (type='task' filter applied internally)
  const tasks = await query_tasks_from_entities({
    filters,
    sort,
    limit,
    offset
  })

  // Get total count for pagination
  const total_count = await count_tasks_from_entities({
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
 * Process task table request using filesystem (fallback)
 */
async function process_task_table_request_filesystem({
  table_state,
  requesting_user_public_key
}) {
  // Get tasks from filesystem
  const all_tasks = await list_tasks_from_filesystem({
    include_completed: true,
    archived: false
  })

  // Apply task-level permissions and redaction
  const redacted_tasks = await process_tasks_with_permissions(
    all_tasks,
    requesting_user_public_key
  )

  // Process with generic table processor
  const result = await process_generic_table_request({
    data: redacted_tasks,
    table_state,
    extract_metadata: process_task_for_table,
    get_value: get_task_value_for_sorting,
    default_sort: CONFIG.table.default_sort,
    column_types: CONFIG.column_types
  })

  // Apply tag-level redaction to the processed result
  const { tasks: final_rows, tag_visibility } =
    await apply_tag_redaction_to_tasks({
      tasks: result.data,
      user_public_key: requesting_user_public_key
    })

  const response = normalize_response(
    { ...result, data: final_rows },
    table_state
  )
  response.tag_visibility = tag_visibility
  response.metadata.source = 'filesystem'
  return response
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

  try {
    // Try to use indexed query if available
    if (embedded_index_manager.is_sqlite_ready()) {
      log('Using SQLite index for task query')
      try {
        return await process_task_table_request_indexed({
          table_state,
          requesting_user_public_key
        })
      } catch (index_error) {
        log(
          'SQLite index query failed, falling back to filesystem: %s',
          index_error.message
        )
      }
    }

    // Fallback to filesystem-based query
    log('Using filesystem for task query')
    return await process_task_table_request_filesystem({
      table_state,
      requesting_user_public_key
    })
  } catch (error) {
    log(`Error processing task table request: ${error.message}`)
    throw error
  }
}

export default process_task_table_request
