import debug from 'debug'
import db from '#db'
import { write_entity_to_database } from './write-entity-to-database.mjs'

const log = debug('entity:database:write-task')

/**
 * Write a task entity to the database
 *
 * @param {Object} params Parameters
 * @param {Object} params.task_properties Task properties object
 * @param {string} params.task_properties.title Task title (required)
 * @param {string} params.task_properties.entity_id Entity ID (required)
 * @param {string} [params.task_properties.description=''] Task description
 * @param {string} [params.task_properties.permalink=null] Custom URL path (auto-generated if omitted)
 * @param {Object} [params.task_properties.relations={}] Relations object with relation types as keys and arrays of target IDs as values
 * @param {string[]} [params.task_properties.tags=[]] Tags to associate with the task
 * @param {string[]} [params.task_properties.observations=[]] Array of structured observations
 * @param {Date} [params.task_properties.created_at] Creation timestamp (auto-generated if omitted)
 * @param {Date} [params.task_properties.updated_at] Last modified timestamp (auto-generated if omitted)
 * @param {Date} [params.task_properties.archived_at=null] Date when the task was archived
 * @param {string} [params.task_properties.status='No status'] Task status (No status, Waiting, Paused, Planned, Started, In Progress, Completed, Cancelled, Blocked)
 * @param {string} [params.task_properties.priority=null] Task priority (None, Low, Medium, High, Critical)
 * @param {Date} [params.task_properties.start_by=null] Date by which the task should be started
 * @param {Date} [params.task_properties.finish_by=null] Deadline date for task completion
 * @param {Date} [params.task_properties.planned_start=null] Scheduled start time
 * @param {Date} [params.task_properties.planned_finish=null] Scheduled finish time
 * @param {number} [params.task_properties.estimated_total_duration=null] Estimated total hours to complete the task
 * @param {number} [params.task_properties.estimated_preparation_duration=null] Estimated hours for preparation phase
 * @param {number} [params.task_properties.estimated_execution_duration=null] Estimated hours for execution phase
 * @param {number} [params.task_properties.estimated_cleanup_duration=null] Estimated hours for cleanup phase
 * @param {number} [params.task_properties.actual_duration=null] Actual hours spent on the task
 * @param {Date} [params.task_properties.started_at=null] Actual start time
 * @param {Date} [params.task_properties.finished_at=null] Actual completion time
 * @param {Date} [params.task_properties.snooze_until=null] Date/time to postpone the task until
 * @param {string} [params.task_properties.assigned_to=null] Person or team responsible for the task
 * @param {string} params.user_id User ID who owns the task
 * @param {string} [params.task_content=''] Optional task content/markdown
 * @param {Object} [params.file_info=null] Optional file information
 * @param {string} [params.file_info.absolute_path=null] Absolute path to the file
 * @param {string} [params.file_info.git_sha=null] Git SHA of the file
 * @param {string} [params.file_info.base_relative_path=null] Base relative path of the task
 * @param {Object} [params.trx=null] Optional transaction object
 * @returns {Promise<string>} The entity_id
 */
export async function write_task_to_database({
  task_properties,
  user_id,
  task_content = '',
  file_info = null,
  trx = null
}) {
  try {
    log('Writing task to database')
    const db_client = trx || db

    // First write the base entity
    const entity_id = await write_entity_to_database({
      entity_properties: task_properties,
      entity_type: 'task',
      user_id,
      entity_content: task_content,
      file_info,
      trx: db_client
    })

    // Process task-specific data directly
    await write_task_data_to_database({
      entity_id,
      status: task_properties.status,
      priority: task_properties.priority,
      start_by: task_properties.start_by,
      finish_by: task_properties.finish_by,
      planned_start: task_properties.planned_start,
      planned_finish: task_properties.planned_finish,
      estimated_total_duration: task_properties.estimated_total_duration,
      estimated_preparation_duration:
        task_properties.estimated_preparation_duration,
      estimated_execution_duration:
        task_properties.estimated_execution_duration,
      estimated_cleanup_duration: task_properties.estimated_cleanup_duration,
      actual_duration: task_properties.actual_duration,
      started_at: task_properties.started_at,
      finished_at: task_properties.finished_at,
      snooze_until: task_properties.snooze_until,
      assigned_to: task_properties.assigned_to,
      db_client
    })

    log(`Task successfully written with ID: ${entity_id}`)
    return entity_id
  } catch (error) {
    log('Error writing task to database:', error)
    throw error
  }
}

/**
 * Write task-specific data to the database
 *
 * @param {Object} params Parameters
 * @param {string} params.entity_id Entity ID
 * @param {string} [params.status='No status'] Task status (No status, Waiting, Paused, Planned, Started, In Progress, Completed, Cancelled, Blocked)
 * @param {string} [params.priority=null] Task priority (None, Low, Medium, High, Critical)
 * @param {Date} [params.start_by=null] Date by which the task should be started
 * @param {Date} [params.finish_by=null] Deadline date for task completion
 * @param {Date} [params.planned_start=null] Scheduled start time
 * @param {Date} [params.planned_finish=null] Scheduled finish time
 * @param {number} [params.estimated_total_duration=null] Estimated total hours to complete the task
 * @param {number} [params.estimated_preparation_duration=null] Estimated hours for preparation phase
 * @param {number} [params.estimated_execution_duration=null] Estimated hours for execution phase
 * @param {number} [params.estimated_cleanup_duration=null] Estimated hours for cleanup phase
 * @param {number} [params.actual_duration=null] Actual hours spent on the task
 * @param {Date} [params.started_at=null] Actual start time
 * @param {Date} [params.finished_at=null] Actual completion time
 * @param {Date} [params.snooze_until=null] Date/time to postpone the task until
 * @param {string} [params.assigned_to=null] Person or team responsible for the task
 * @param {Object} params.db_client Database client
 * @returns {Promise<void>}
 */
async function write_task_data_to_database({
  entity_id,
  status = 'No status',
  priority = null,
  start_by = null,
  finish_by = null,
  planned_start = null,
  planned_finish = null,
  estimated_total_duration = null,
  estimated_preparation_duration = null,
  estimated_execution_duration = null,
  estimated_cleanup_duration = null,
  actual_duration = null,
  started_at = null,
  finished_at = null,
  snooze_until = null,
  assigned_to = null,
  db_client
}) {
  log(`Writing task data for entity: ${entity_id}`)

  // Process task-specific data
  const task_data = {
    entity_id,
    status,
    priority,
    start_by,
    finish_by,
    planned_start,
    planned_finish,
    estimated_total_duration,
    estimated_preparation_duration,
    estimated_execution_duration,
    estimated_cleanup_duration,
    actual_duration,
    started_at,
    finished_at,
    snooze_until,
    assigned_to
  }

  // Upsert task data
  await db_client('tasks').insert(task_data).onConflict('entity_id').merge()

  log(`Task data written successfully for entity: ${entity_id}`)
}

export default write_task_to_database
