import express from 'express'

import {
  list_tasks_from_filesystem,
  read_task_from_filesystem
} from '#libs-server/task/index.mjs'
import { process_task_table_request } from '#libs-server/tasks/process-task-table-request.mjs'
import { check_user_permission_for_file } from '../middleware/permission/index.mjs'
import { redact_entity_object } from '../middleware/content-redactor.mjs'

const router = express.Router({ mergeParams: true })

// Helper function to check user permissions for a file
const check_file_permission = async (user_public_key, absolute_path) => {
  if (!user_public_key) return false

  return await check_user_permission_for_file({
    user_public_key,
    absolute_path
  })
}

// Helper function to parse array query parameters
const parse_array_params = (param) => {
  if (!param) return []
  return Array.isArray(param) ? param : [param]
}

// Centralized function to check task permissions and build response
const check_task_permission_and_build_response = async ({
  task,
  user_public_key,
  base_uri = null,
  include_content = false
}) => {
  // Check file permissions (ownership check is now handled in check_file_permission)
  const has_permission = await check_file_permission(
    user_public_key,
    task.file_info?.absolute_path || task.absolute_path
  )

  let response_data

  if (!has_permission) {
    const redacted_task = redact_entity_object({
      entity_properties: task.entity_properties,
      entity_content: task.entity_content
    })

    // Return nested structure with entity_properties
    response_data = {
      entity_properties: redacted_task.entity_properties,
      file_info: task.file_info,
      is_redacted: true
    }
  } else {
    // Return nested structure with entity_properties
    response_data = {
      entity_properties: task.entity_properties,
      file_info: task.file_info
    }
  }

  // Add base_uri if provided
  if (base_uri) {
    response_data.base_uri = base_uri
  }

  // Add content if requested
  if (include_content) {
    response_data.content = task.entity_content
  }

  return response_data
}

// POST /api/tasks/table - Server-side table processing
router.post('/table', async (req, res) => {
  const { log } = req.app.locals

  try {
    const { table_state } = req.body

    // Validate table_state structure
    if (table_state && typeof table_state !== 'object') {
      return res.status(400).json({
        error: 'Invalid table_state',
        message: 'table_state must be an object matching react-table schema'
      })
    }

    const user_public_key = req.user?.user_public_key || null

    const results = await process_task_table_request({
      table_state: table_state || {},
      requesting_user_public_key: user_public_key
    })

    log(
      `Tasks table request processed: ${results.rows.length}/${results.total_row_count} tasks`
    )

    res.status(200).json(results)
  } catch (error) {
    log('Error processing tasks table request:', error)
    res.status(500).json({
      error: 'Failed to process tasks table request',
      message: error.message
    })
  }
})

// GET /api/tasks - Get all tasks with optional filtering OR get a specific task by base_uri
router.get('/', async (req, res) => {
  const { log } = req.app.locals

  try {
    const user_public_key = req.user?.user_public_key || null
    const { base_uri, archived, ...filter_params } = req.query

    // If base_uri is provided, get a specific task
    if (base_uri) {
      await handle_single_task_request(req, res, base_uri, user_public_key)
      return
    }

    // Otherwise, list all tasks with filtering
    await handle_task_list_request(
      req,
      res,
      filter_params,
      archived,
      user_public_key
    )
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

// Handle request for a single task
async function handle_single_task_request(req, res, base_uri, user_public_key) {
  try {
    const task = await read_task_from_filesystem({ base_uri })

    if (!task.success) {
      return res.status(404).send({ error: task.error || 'Task not found' })
    }

    const response_data = await check_task_permission_and_build_response({
      task,
      user_public_key,
      base_uri,
      include_content: true
    })

    res.status(200).send(response_data)
  } catch (error) {
    res.status(404).send({
      error: `Task ${base_uri} not found: ${error.message}`
    })
  }
}

// Handle request for list of tasks
async function handle_task_list_request(
  req,
  res,
  filter_params,
  archived,
  user_public_key
) {
  const {
    status,
    tag_entity_ids,
    organization_ids,
    person_ids,
    min_finish_by,
    max_finish_by,
    min_estimated_total_duration,
    max_estimated_total_duration,
    min_planned_start,
    max_planned_start,
    min_planned_finish,
    max_planned_finish
  } = filter_params

  const all_tasks = await list_tasks_from_filesystem({
    status,
    tag_entity_ids: parse_array_params(tag_entity_ids),
    organization_ids: parse_array_params(organization_ids),
    person_ids: parse_array_params(person_ids),
    min_finish_by,
    max_finish_by,
    min_estimated_total_duration,
    max_estimated_total_duration,
    min_planned_start,
    max_planned_start,
    min_planned_finish,
    max_planned_finish,
    archived: archived === 'true'
  })

  // Apply redaction to tasks based on user permissions
  const tasks = await Promise.all(
    all_tasks.map(async (task) => {
      return await check_task_permission_and_build_response({
        task,
        user_public_key
      })
    })
  )

  res.status(200).send(tasks)
}

export default router
