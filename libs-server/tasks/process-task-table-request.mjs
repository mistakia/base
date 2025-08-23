/**
 * @fileoverview Server-side table request processing for tasks
 */

import debug from 'debug'
import { list_tasks_from_filesystem } from '#libs-server/task/filesystem/list-tasks-from-filesystem.mjs'
import { process_generic_table_request } from '#libs-server/table-processing/process-table-request.mjs'
import { TABLE_DATA_TYPES } from 'react-table/src/constants.mjs'

const log = debug('tasks:table')

/**
 * Column type mapping for task data based on task schema
 */
const TASK_COLUMN_TYPES = {
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
}

/**
 * Extract and format task metadata for table display
 * @param {Object} task_entity - Raw task entity from filesystem
 * @returns {Object} Processed task for table display
 */
async function extract_task_metadata(task_entity) {
  const { entity_properties, entity_content, file_path, file_info } =
    task_entity

  // Extract basic properties
  const task_metadata = {
    entity_id: entity_properties.entity_id,
    title: entity_properties.title || 'Untitled',
    status: entity_properties.status || 'No status',
    priority: entity_properties.priority || 'None',
    description: entity_properties.description || '',
    created_at: entity_properties.created_at,
    updated_at: entity_properties.updated_at,
    user_public_key: entity_properties.user_public_key,

    // Task-specific fields from schema
    start_by: entity_properties.start_by,
    finish_by: entity_properties.finish_by,
    planned_start: entity_properties.planned_start,
    planned_finish: entity_properties.planned_finish,
    started_at: entity_properties.started_at,
    finished_at: entity_properties.finished_at,
    snooze_until: entity_properties.snooze_until,
    estimated_total_duration: entity_properties.estimated_total_duration,
    estimated_preparation_duration:
      entity_properties.estimated_preparation_duration,
    estimated_execution_duration:
      entity_properties.estimated_execution_duration,
    estimated_cleanup_duration: entity_properties.estimated_cleanup_duration,
    actual_duration: entity_properties.actual_duration,
    assigned_to: entity_properties.assigned_to,
    archived: entity_properties.archived || false,

    // Additional metadata
    file_path,
    base_uri: file_info?.base_uri, // Include base_uri for client-side navigation
    content_preview: entity_content
      ? entity_content.substring(0, 200) + '...'
      : '',

    // Relations (if any)
    relations: entity_properties.relations || [],
    tags: entity_properties.tags || []
  }

  return task_metadata
}

/**
 * Process table request with server-side filtering, sorting, and pagination
 *
 * @param {Object} params Parameters
 * @param {Object} [params.table_state] React-table state object (includes limit/offset)
 * @param {string} [params.requesting_user_public_key] Requesting user's public key for permissions
 * @returns {Promise<Object>} Processed table data
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
    // Get all tasks using existing list_tasks_from_filesystem function
    const raw_tasks = await list_tasks_from_filesystem({
      user_public_key: requesting_user_public_key,
      // Include all tasks for table processing (filtering will be done in table processor)
      include_completed: true,
      archived: false // Don't include archived by default
    })

    // Use generic table processing with task-specific configuration
    return await process_generic_table_request({
      data: raw_tasks,
      table_state,
      extract_metadata: extract_task_metadata,
      default_sort: { column_id: 'created_at', desc: true },
      column_types: TASK_COLUMN_TYPES
    })
  } catch (error) {
    log(`Error processing task table request: ${error.message}`)
    throw error
  }
}

export default process_task_table_request
