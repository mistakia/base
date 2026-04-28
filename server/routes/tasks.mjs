import express from 'express'
import debug from 'debug'
import { safe_error_message } from '#server/utils/error-response.mjs'

import {
  HTTP_MAX_AGE,
  HTTP_STALE_WHILE_REVALIDATE
} from '#server/constants/http-cache.mjs'
import { parse_array_param } from '#server/utils/query-params.mjs'
import {
  list_tasks_from_filesystem,
  read_task_from_filesystem
} from '#libs-server/task/index.mjs'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/write-entity-to-filesystem.mjs'
import { load_schema_definitions_from_filesystem } from '#libs-server/repository/filesystem/load-schema-definitions-from-filesystem.mjs'
import { resolve_base_uri_from_registry } from '#libs-server/base-uri/index.mjs'
import { TASK_STATUS, TASK_PRIORITY } from '#libs-shared/task-constants.mjs'
import { process_task_table_request } from '#server/lib/tasks/process-task-table-request.mjs'
import { apply_tag_redaction_to_tasks } from '#server/lib/tasks/tag-visibility.mjs'
import {
  check_user_permission_for_file,
  check_permission,
  check_permissions_batch
} from '#server/middleware/permission/index.mjs'
import { redact_entity_object } from '#server/middleware/content-redactor.mjs'
import { get_cached_tasks } from '#server/services/cache-warmer.mjs'
import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'
import { sync_task_to_github } from '#libs-server/integrations/github/sync-task-to-github.mjs'

const log = debug('api:tasks')
const router = express.Router({ mergeParams: true })

// Helper function to check user permissions for a file
// Delegates to permission service which respects public_read entity setting
const check_file_permission = async (user_public_key, absolute_path) => {
  return await check_user_permission_for_file({
    user_public_key,
    absolute_path
  })
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

    // Add redacted content if requested
    if (include_content) {
      response_data.content = redacted_task.entity_content
    }
  } else {
    // Return nested structure with entity_properties
    response_data = {
      entity_properties: task.entity_properties,
      file_info: task.file_info
    }

    // Add original content if requested
    if (include_content) {
      response_data.content = task.entity_content
    }
  }

  // Add base_uri if provided
  if (base_uri) {
    response_data.base_uri = base_uri
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
      message: safe_error_message(error)
    })
  }
})

// GET /api/tasks - Get all tasks with optional filtering OR get a specific task by base_uri
router.get('/', async (req, res) => {
  const { log } = req.app.locals

  try {
    const user_public_key = req.user?.user_public_key || null
    const is_public_request = !user_public_key
    const {
      base_uri,
      archived,
      limit: limit_param,
      offset: offset_param,
      ...filter_params
    } = req.query
    const limit = parseInt(limit_param) || 100
    const offset = parseInt(offset_param) || 0

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
      user_public_key,
      limit,
      offset
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

// Convert SQLite task result to API response format (nested entity_properties)
function convert_sqlite_task_to_response_format(task) {
  return {
    entity_properties: {
      entity_id: task.entity_id,
      base_uri: task.base_uri,
      title: task.title,
      status: task.status,
      priority: task.priority,
      description: task.description,
      created_at: task.created_at,
      updated_at: task.updated_at,
      user_public_key: task.user_public_key,
      start_by: task.start_by,
      finish_by: task.finish_by,
      planned_start: task.planned_start,
      planned_finish: task.planned_finish,
      started_at: task.started_at,
      finished_at: task.finished_at,
      snooze_until: task.snooze_until,
      estimated_total_duration: task.estimated_total_duration,
      archived: task.archived,
      tags: task.tags || []
    },
    file_info: {
      base_uri: task.base_uri,
      absolute_path: null // Not available from SQLite
    }
  }
}

// Build SQLite filters from query params
function build_sqlite_filters_from_query(params) {
  const { status, priority, archived, include_completed } = params
  const filters = []

  // Exclude archived by default (unless archived=true)
  if (archived !== 'true') {
    filters.push({ column_id: 'archived', operator: '!=', value: true })
  }

  // Exclude completed by default (matches filesystem behavior)
  if (!include_completed && !status) {
    filters.push({
      column_id: 'status',
      operator: '!=',
      value: TASK_STATUS.COMPLETED
    })
  }

  if (status) {
    filters.push({ column_id: 'status', operator: '=', value: status })
  }

  // Priority filter
  if (priority) {
    filters.push({ column_id: 'priority', operator: '=', value: priority })
  }

  // Range filters: column_id -> { min_param, max_param, transform }
  const range_filters = [
    { column: 'finish_by', min: 'min_finish_by', max: 'max_finish_by' },
    {
      column: 'planned_start',
      min: 'min_planned_start',
      max: 'max_planned_start'
    },
    {
      column: 'planned_finish',
      min: 'min_planned_finish',
      max: 'max_planned_finish'
    },
    {
      column: 'estimated_total_duration',
      min: 'min_estimated_total_duration',
      max: 'max_estimated_total_duration',
      transform: Number
    }
  ]

  for (const { column, min, max, transform } of range_filters) {
    if (params[min]) {
      const value = transform ? transform(params[min]) : params[min]
      filters.push({ column_id: column, operator: '>=', value })
    }
    if (params[max]) {
      const value = transform ? transform(params[max]) : params[max]
      filters.push({ column_id: column, operator: '<=', value })
    }
  }

  return filters
}

// Handle task list request using SQLite index
async function handle_task_list_request_indexed(
  filter_params,
  archived,
  user_public_key,
  limit,
  offset
) {
  const filters = build_sqlite_filters_from_query({
    ...filter_params,
    archived
  })

  const tasks = await embedded_index_manager.query_tasks({
    filters,
    sort: [{ column_id: 'created_at', desc: true }],
    limit,
    offset
  })

  // Convert to API response format
  const formatted_tasks = tasks.map(convert_sqlite_task_to_response_format)

  // Batch permission check for all tasks
  const resource_paths = formatted_tasks.map(
    (task) => task.entity_properties.base_uri
  )
  let permissions = {}
  if (resource_paths.length > 0) {
    try {
      permissions = await check_permissions_batch({
        user_public_key,
        resource_paths
      })
    } catch (error) {
      log(
        `Error batch checking permissions (applying default deny): ${error.message}`
      )
    }
  }

  // Apply redaction based on batch permission results
  const redacted_tasks = formatted_tasks.map((task) => {
    const base_uri = task.entity_properties.base_uri
    const allowed = permissions[base_uri]?.read?.allowed ?? false

    if (allowed) {
      return task
    }

    // Redact if no permission
    return {
      entity_properties: redact_entity_object({
        entity_properties: task.entity_properties,
        entity_content: null
      }).entity_properties,
      file_info: task.file_info,
      is_redacted: true
    }
  })

  // Apply tag-level redaction
  const { tasks: final_tasks, tag_visibility } =
    await apply_tag_redaction_to_tasks({
      tasks: redacted_tasks,
      user_public_key
    })

  return { tasks: final_tasks, tag_visibility }
}

// Handle request for list of tasks
async function handle_task_list_request(
  req,
  res,
  filter_params,
  archived,
  user_public_key,
  limit,
  offset
) {
  const {
    status,
    priority,
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
    priority ||
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

  // For authenticated requests, try SQLite first for better performance
  if (user_public_key && embedded_index_manager.is_ready()) {
    // Note: tag_entity_ids, organization_ids, person_ids not yet supported in SQLite path
    const has_unsupported_filters =
      tag_entity_ids || organization_ids || person_ids

    if (!has_unsupported_filters) {
      try {
        log('Using embedded index for authenticated task query')
        const result = await handle_task_list_request_indexed(
          filter_params,
          archived,
          user_public_key,
          limit,
          offset
        )
        return res.status(200).send(result)
      } catch (error) {
        log(
          'Indexed task query failed, falling back to filesystem: %s',
          error.message
        )
      }
    }
  }

  // Fallback: Cache miss or filtered request - fetch fresh data from filesystem
  log('Fetching tasks from filesystem')

  const all_tasks = await list_tasks_from_filesystem({
    status,
    // Convert single priority to include_priority array for filesystem filter
    include_priority: priority ? [priority] : [],
    tag_entity_ids: parse_array_param(tag_entity_ids),
    organization_ids: parse_array_param(organization_ids),
    person_ids: parse_array_param(person_ids),
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

  // Apply pagination
  const paginated_tasks = tasks.slice(offset, offset + limit)

  res.status(200).send({ tasks: paginated_tasks, tag_visibility })
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

    // Read existing entity (not task-specific, to preserve non-task types)
    const entity = await read_task_from_filesystem({ base_uri })

    if (!entity.success) {
      return res.status(404).json({ error: entity.error || 'Entity not found' })
    }

    // Check write permission
    const permission_result = await check_permission({
      user_public_key,
      resource_path: base_uri
    })

    if (!permission_result.write.allowed) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    const entity_type = entity.entity_properties.type
    const is_task = entity_type === 'task'

    // Build allowlist: universal mutable fields + schema-defined frontmatter fields
    // for the resolved entity type. Identity/timestamp fields are never settable
    // via PATCH regardless of schema (denied below).
    const universal_fields = [
      'status',
      'priority',
      'tags',
      'relations',
      'observations',
      'description',
      'start_by',
      'finish_by',
      'assigned_to',
      'snooze_until',
      'abandoned_reason',
      'started_at',
      'finished_at'
    ]
    const denied_fields = new Set([
      'entity_id',
      'type',
      'base_uri',
      'created_at',
      'updated_at',
      'public_read',
      'user_public_key'
    ])

    let schema_field_names = []
    try {
      const schemas = await load_schema_definitions_from_filesystem()
      const schema = schemas[entity_type]
      if (schema && Array.isArray(schema.properties)) {
        schema_field_names = schema.properties
          .map((p) => p && p.name)
          .filter((name) => typeof name === 'string')
      }
    } catch (err) {
      log('Schema load failed for type %s: %s', entity_type, err.message)
    }

    const allowed_fields = new Set(
      [...universal_fields, ...schema_field_names].filter(
        (name) => !denied_fields.has(name)
      )
    )

    const update_properties = {}
    for (const field of Object.keys(properties)) {
      if (allowed_fields.has(field)) {
        update_properties[field] = properties[field]
      }
    }

    if (Object.keys(update_properties).length === 0) {
      return res.status(400).json({
        error: `No valid properties to update for entity type "${entity_type}". Allowed fields: ${[...allowed_fields].sort().join(', ')}`
      })
    }

    // Validate status value (task-specific enum)
    if (is_task && 'status' in update_properties) {
      const valid_statuses = Object.values(TASK_STATUS)
      if (!valid_statuses.includes(update_properties.status)) {
        return res.status(400).json({
          error: `Invalid status value. Must be one of: ${valid_statuses.join(', ')}`
        })
      }
    }

    // Validate priority value (task-specific enum)
    if (is_task && 'priority' in update_properties) {
      const valid_priorities = Object.values(TASK_PRIORITY)
      if (!valid_priorities.includes(update_properties.priority)) {
        return res.status(400).json({
          error: `Invalid priority value. Must be one of: ${valid_priorities.join(', ')}`
        })
      }
    }

    // Validate array-type fields
    const array_fields = ['tags', 'relations', 'observations']
    for (const field of array_fields) {
      if (
        field in update_properties &&
        !Array.isArray(update_properties[field])
      ) {
        return res.status(400).json({
          error: `${field} must be an array`
        })
      }
    }

    // Merge properties and write back
    const now = new Date().toISOString()
    const merged_properties = {
      ...entity.entity_properties,
      ...update_properties,
      updated_at: now
    }

    // Auto-set timestamps only for task entities
    if (is_task && update_properties.status) {
      if (
        (update_properties.status === TASK_STATUS.STARTED ||
          update_properties.status === TASK_STATUS.IN_PROGRESS) &&
        !merged_properties.started_at
      ) {
        merged_properties.started_at = now
      }
      if (
        (update_properties.status === TASK_STATUS.COMPLETED ||
          update_properties.status === TASK_STATUS.ABANDONED) &&
        !merged_properties.finished_at
      ) {
        merged_properties.finished_at = now
      }
    }

    const absolute_path = resolve_base_uri_from_registry(base_uri)
    await write_entity_to_filesystem({
      absolute_path,
      entity_properties: merged_properties,
      entity_type,
      entity_content: entity.entity_content || ''
    })

    log(`Entity ${base_uri} updated: ${JSON.stringify(update_properties)}`)

    res.status(200).json({
      success: true,
      base_uri,
      updated_properties: update_properties
    })

    // Sync status/priority changes to GitHub project fields (best-effort, after response)
    if (
      is_task &&
      !req.body.no_sync &&
      (update_properties.status || update_properties.priority)
    ) {
      sync_task_to_github({
        entity_properties: merged_properties,
        changed_fields: {
          status: update_properties.status,
          priority: update_properties.priority
        },
        previous_status: entity.entity_properties.status
      }).catch((err) =>
        log('GitHub sync failed for %s: %s', base_uri, err.message)
      )
    }
  } catch (error) {
    log('Error updating task:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router
