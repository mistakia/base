import debug from 'debug'

import config from '#config'
import { register_provider } from '#libs-server/mcp/service.mjs'
import { format_response, format_error } from '#libs-server/mcp/utils.mjs'
import { tasks as task_service } from '#libs-server'
import {
  filter_displayable_tasks,
  sort_tasks_by_importance
} from '#libs-shared/task-filters.mjs'
import { TASK_STATUS, TASK_PRIORITY } from '#libs-shared/task-constants.mjs'

const log = debug('mcp:tasks:provider')

// Register this provider
register_provider('tasks', {
  handle_request
})

/**
 * Format a task for efficient token usage and better inference
 * @param {Object} task The task to format
 * @returns {Object} Formatted task
 */
function format_task(task) {
  // Extract key information and ensure arrays have default values
  const {
    task_id,
    title,
    description,
    status,
    priority,
    finish_by,
    started_at,
    finished_at,
    // Handle null array values from database
    parent_task_ids: raw_parent_task_ids,
    child_task_ids: raw_child_task_ids,
    blocking_task_ids: raw_blocking_task_ids,
    tag_entity_ids: raw_tag_ids,
    blocked_task_ids: raw_blocked_task_ids
  } = task

  // Ensure arrays are defined and filter out null values
  const parent_task_ids = raw_parent_task_ids?.filter(Boolean) || []
  const child_task_ids = raw_child_task_ids?.filter(Boolean) || []
  const blocking_task_ids = raw_blocking_task_ids?.filter(Boolean) || []
  const blocked_task_ids = raw_blocked_task_ids?.filter(Boolean) || []
  const tag_ids = raw_tag_ids?.filter(Boolean) || []

  // Create status context for better inference
  const status_context = (() => {
    if (status === TASK_STATUS.COMPLETED) return 'done'
    if (status === TASK_STATUS.IN_PROGRESS) return 'active'
    if (status === TASK_STATUS.BLOCKED) return 'blocked'
    if (status === TASK_STATUS.STARTED) return 'active'
    if (status === TASK_STATUS.PLANNED) return 'upcoming'
    if (status === TASK_STATUS.WAITING) return 'pending'
    if (status === TASK_STATUS.PAUSED) return 'paused'
    return 'new'
  })()

  // Create priority context for better inference
  const priority_context = (() => {
    if (priority === TASK_PRIORITY.CRITICAL) return 'urgent'
    if (priority === TASK_PRIORITY.HIGH) return 'important'
    if (priority === TASK_PRIORITY.MEDIUM) return 'normal'
    if (priority === TASK_PRIORITY.LOW) return 'optional'
    return 'unspecified'
  })()

  // Format dates for efficiency
  const format_date = (date) =>
    date ? new Date(date).toISOString().split('T')[0] : null

  // Build relationships context - only include non-empty relationships
  const relationships = {
    ...(parent_task_ids.length > 0 && { parent_tasks: parent_task_ids.length }),
    ...(child_task_ids.length > 0 && { child_tasks: child_task_ids.length }),
    ...(blocking_task_ids.length > 0 && {
      blocking_tasks: blocking_task_ids.length
    }),
    ...(blocked_task_ids.length > 0 && {
      blocked_tasks: blocked_task_ids.length
    }),
    ...(tag_ids.length > 0 && { tags: tag_ids.length })
  }

  // Return optimized task format
  return {
    id: task_id,
    title,
    ...(description && { description: description.substring(0, 280) }), // Limit description length
    state: {
      status: status_context,
      priority: priority_context,
      ...(finish_by && { due: format_date(finish_by) }),
      ...(started_at && { started: format_date(started_at) }),
      ...(finished_at && { finished: format_date(finished_at) })
    },
    ...(Object.keys(relationships).length > 0 && { relationships })
  }
}

/**
 * Handle an MCP request
 * @param {Object} request MCP request
 * @returns {Object} MCP response
 */
async function handle_request(request) {
  const { method, params } = request

  if (method === 'tools/call') {
    return handle_tool_call(params)
  }

  throw new Error(`Unsupported method: ${method}`)
}

/**
 * Handle a tool call
 * @param {Object} params Tool call parameters
 * @returns {Object} Tool call result
 */
async function handle_tool_call(params) {
  const { name, arguments: args } = params

  switch (name) {
    case 'task_get_filtered':
      return handle_get_filtered_tasks(args)
    case 'task_get':
      return handle_get_task(args)
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

/**
 * Handle get filtered tasks request
 * @param {Object} args Tool arguments
 * @returns {Object} Result
 */
async function handle_get_filtered_tasks(args) {
  const {
    user_id = config.user_id,
    include_completed = false,
    tag_ids = [],
    organization_ids = [],
    person_ids = [],
    min_finish_by,
    max_finish_by
  } = args

  try {
    // Get all tasks for the user with the provided filters
    const tasks = await task_service.get_tasks({
      user_id,
      tag_ids,
      organization_ids,
      person_ids,
      min_finish_by,
      max_finish_by
    })

    // Apply our display filtering if we're not including completed tasks
    let filtered_tasks = tasks
    if (!include_completed) {
      filtered_tasks = filter_displayable_tasks(tasks)
    }

    // Sort the tasks by importance
    const sorted_tasks = sort_tasks_by_importance(filtered_tasks)

    // Format tasks for response
    const formatted_tasks = sorted_tasks.map(format_task)

    return format_response({
      success: true,
      count: formatted_tasks.length,
      tasks: formatted_tasks
    })
  } catch (error) {
    console.log(error)
    log('Error handling get_filtered_tasks:', error)
    return format_error('get_filtered_tasks', error)
  }
}

/**
 * Handle get task request
 * @param {Object} args Tool arguments
 * @returns {Object} Result
 */
async function handle_get_task(args) {
  const { task_id, user_id } = args

  try {
    const task = await task_service.get_task({ task_id })

    // Verify the user has access to this task
    if (!task || task.user_id !== user_id) {
      throw new Error('Task not found or access denied')
    }

    return format_response({
      success: true,
      task: format_task(task)
    })
  } catch (error) {
    log('Error handling get_task:', error)
    return format_error('get_task', error)
  }
}
