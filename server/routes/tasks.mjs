import express from 'express'
import debug from 'debug'

import {
  list_tasks_from_filesystem,
  read_task_from_filesystem,
  write_task_to_filesystem
} from '#libs-server/task/index.mjs'
import { TASK_STATUS, TASK_PRIORITY } from '#libs-shared/task-constants.mjs'
import { process_task_table_request } from '#libs-server/tasks/process-task-table-request.mjs'
import { apply_tag_redaction_to_tasks } from '#libs-server/tasks/tag-visibility.mjs'
import {
  check_user_permission_for_file,
  check_permission
} from '#server/middleware/permission/index.mjs'
import { redact_entity_object } from '#server/middleware/content-redactor.mjs'
import { get_cached_tasks } from '#server/services/cache-warmer.mjs'

const log = debug('api:tasks')
const router = express.Router({ mergeParams: true })

// HTTP cache headers for public requests
const HTTP_MAX_AGE = 5 * 60
const HTTP_STALE_WHILE_REVALIDATE = 4 * 60 * 60

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
    const is_public_request = !user_public_key
    const { base_uri, archived, ...filter_params } = req.query

    // Set Vary header for all requests to ensure browsers cache authenticated
    // and unauthenticated responses separately
    res.set('Vary', 'Authorization')

    // If base_uri is provided, get a specific task
    if (base_uri) {
      // Set cache headers for single task requests
      if (is_public_request) {
        res.set(
          'Cache-Control',
          `public, max-age=${HTTP_MAX_AGE}, stale-while-revalidate=${HTTP_STALE_WHILE_REVALIDATE}`
        )
      } else {
        res.set('Cache-Control', 'private, no-cache')
      }
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

    // Apply task-level redaction
    const task_with_redaction = await check_task_permission_and_build_response({
      task,
      user_public_key,
      base_uri,
      include_content: true
    })

    // Apply tag-level redaction
    const { tasks, tag_visibility } = await apply_tag_redaction_to_tasks({
      tasks: [task_with_redaction],
      user_public_key
    })

    // Return single task with tag_visibility
    res.status(200).send({ ...tasks[0], tag_visibility })
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

  // Check if we have filter params (don't use cached data for filtered requests)
  const has_filters =
    status ||
    tag_entity_ids ||
    organization_ids ||
    person_ids ||
    min_finish_by ||
    max_finish_by ||
    min_estimated_total_duration ||
    max_estimated_total_duration ||
    min_planned_start ||
    max_planned_start ||
    min_planned_finish ||
    max_planned_finish ||
    archived === 'true'

  // For public (unauthenticated) requests without filters, use caching
  const is_public_request = !user_public_key
  const is_cacheable = is_public_request && !has_filters

  // Set Cache-Control header (Vary: Authorization is set at main handler level)
  if (is_public_request) {
    res.set(
      'Cache-Control',
      `public, max-age=${HTTP_MAX_AGE}, stale-while-revalidate=${HTTP_STALE_WHILE_REVALIDATE}`
    )
  } else {
    // Authenticated requests should not be cached by shared caches
    // and browsers should revalidate on each request
    res.set('Cache-Control', 'private, no-cache')
  }

  // Check centralized cache (maintained by cache-warmer service)
  if (is_cacheable) {
    const cached_data = get_cached_tasks()
    if (cached_data) {
      log('Returning cached tasks list')

      // Apply task-level redaction based on user permissions
      const redacted_tasks = await Promise.all(
        cached_data.map(async (task) => {
          return await check_task_permission_and_build_response({
            task,
            user_public_key
          })
        })
      )

      // Apply tag-level redaction (redact non-visible tag URIs)
      const { tasks, tag_visibility } = await apply_tag_redaction_to_tasks({
        tasks: redacted_tasks,
        user_public_key
      })

      return res.status(200).send({ tasks, tag_visibility })
    }
  }

  // Cache miss or filtered request - fetch fresh data
  log('Fetching tasks (cache miss or filtered)')

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

  // Apply task-level redaction based on user permissions
  const redacted_tasks = await Promise.all(
    all_tasks.map(async (task) => {
      return await check_task_permission_and_build_response({
        task,
        user_public_key
      })
    })
  )

  // Apply tag-level redaction (redact non-visible tag URIs)
  const { tasks, tag_visibility } = await apply_tag_redaction_to_tasks({
    tasks: redacted_tasks,
    user_public_key
  })

  res.status(200).send({ tasks, tag_visibility })
}

// PATCH /api/tasks - Update task status and/or priority
router.patch('/', async (req, res) => {
  const { log } = req.app.locals

  try {
    const user_public_key = req.user?.user_public_key
    if (!user_public_key) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const { base_uri, properties } = req.body

    // Validate required fields
    if (!base_uri) {
      return res.status(400).json({ error: 'base_uri is required' })
    }

    if (!properties || typeof properties !== 'object') {
      return res.status(400).json({ error: 'properties object is required' })
    }

    // Whitelist only status and priority fields
    const allowed_fields = ['status', 'priority']
    const update_properties = {}

    for (const field of allowed_fields) {
      if (field in properties) {
        update_properties[field] = properties[field]
      }
    }

    if (Object.keys(update_properties).length === 0) {
      return res.status(400).json({
        error:
          'No valid properties to update. Only status and priority are allowed.'
      })
    }

    // Validate status value
    if ('status' in update_properties) {
      const valid_statuses = Object.values(TASK_STATUS)
      if (!valid_statuses.includes(update_properties.status)) {
        return res.status(400).json({
          error: `Invalid status value. Must be one of: ${valid_statuses.join(', ')}`
        })
      }
    }

    // Validate priority value
    if ('priority' in update_properties) {
      const valid_priorities = Object.values(TASK_PRIORITY)
      if (!valid_priorities.includes(update_properties.priority)) {
        return res.status(400).json({
          error: `Invalid priority value. Must be one of: ${valid_priorities.join(', ')}`
        })
      }
    }

    // Read existing task
    const task = await read_task_from_filesystem({ base_uri })

    if (!task.success) {
      return res.status(404).json({ error: task.error || 'Task not found' })
    }

    // Check write permission
    const permission_result = await check_permission({
      user_public_key,
      resource_path: base_uri
    })

    if (!permission_result.write.allowed) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    // Merge properties and write back
    const merged_properties = {
      ...task.entity_properties,
      ...update_properties,
      updated_at: new Date().toISOString()
    }

    const write_result = await write_task_to_filesystem({
      base_uri,
      task_properties: merged_properties,
      task_content: task.entity_content || ''
    })

    if (!write_result.success) {
      return res.status(500).json({ error: write_result.error })
    }

    log(`Task ${base_uri} updated: ${JSON.stringify(update_properties)}`)

    res.status(200).json({
      success: true,
      base_uri,
      updated_properties: update_properties
    })
  } catch (error) {
    log('Error updating task:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router
