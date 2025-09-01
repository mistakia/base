/**
 * @fileoverview Server-side table request processing for tasks
 */

import debug from 'debug'
import { list_tasks_from_filesystem } from '#libs-server/task/filesystem/list-tasks-from-filesystem.mjs'
import { process_generic_table_request } from '#libs-server/table-processing/process-table-request.mjs'
import { TABLE_DATA_TYPES } from 'react-table/src/constants.mjs'
import { check_user_permission_for_file } from '#server/middleware/permission-checker.mjs'
import { redact_entity_object } from '#server/middleware/content-redactor.mjs'

const log = debug('tasks:table')

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
  const { entity_properties, is_redacted } = task_entity

  const properties = extract_task_properties(entity_properties)
  const file_info = extract_file_info(task_entity)

  return {
    ...properties,
    ...file_info,
    is_redacted: is_redacted || false
  }
}

/**
 * Check user permission for task
 */
async function check_task_permission(user_public_key, absolute_path) {
  if (!user_public_key) return false

  return await check_user_permission_for_file({
    user_public_key,
    absolute_path
  })
}

/**
 * Apply redaction if user lacks permission
 */
function apply_redaction_if_needed(task, has_permission) {
  if (has_permission) return task

  return redact_entity_object(task, {
    preserve_keys: CONFIG.redaction.preserved_keys,
    redact_keys: CONFIG.redaction.redacted_keys
  })
}

/**
 * Process all tasks with permission checking
 */
async function process_tasks_with_permissions(tasks, user_public_key) {
  return await Promise.all(
    tasks.map(async (task) => {
      const has_permission = await check_task_permission(
        user_public_key,
        task.file_info?.absolute_path
      )

      return apply_redaction_if_needed(task, has_permission)
    })
  )
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
    // Get tasks from filesystem
    const all_tasks = await list_tasks_from_filesystem({
      include_completed: true,
      archived: false
    })

    // Apply permissions and redaction
    const tasks_with_permissions = await process_tasks_with_permissions(
      all_tasks,
      requesting_user_public_key
    )

    // Process with generic table processor
    const result = await process_generic_table_request({
      data: tasks_with_permissions,
      table_state,
      extract_metadata: process_task_for_table,
      default_sort: CONFIG.table.default_sort,
      column_types: CONFIG.column_types
    })

    return normalize_response(result, table_state)
  } catch (error) {
    log(`Error processing task table request: ${error.message}`)
    throw error
  }
}

export default process_task_table_request
