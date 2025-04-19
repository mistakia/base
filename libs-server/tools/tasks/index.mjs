/**
 * Task tools for the centralized tool registry
 */

import debug from 'debug'
import { register_tool } from '#libs-server/tools/index.mjs'
import config from '#config'
import { tasks as task_service } from '#libs-server/index.mjs' // Assuming tasks service is exported from here
import {
  filter_displayable_tasks,
  sort_tasks_by_importance
} from '#libs-shared/task-filters.mjs'
import { TASK_STATUS, TASK_PRIORITY } from '#libs-shared/task-constants.mjs'

// Setup logger
const log = debug('tools:tasks')

log('Registering task tools')

/**
 * Shared helper functions to reduce code duplication and improve maintainability
 */
const helpers = {
  /**
   * Resolves the user ID from parameters, context, or config
   * @param {Object} parameters Request parameters
   * @param {Object} context Request context
   * @returns {String} Resolved user ID
   */
  resolve_user_id(parameters, context = {}) {
    const user_id = parameters.user_id || context?.user_id || config.user_id

    if (!user_id) {
      throw new Error('User ID is required but could not be determined.')
    }

    return user_id
  },

  /**
   * Verifies a user has access to a task
   * @param {String} task_id Task ID to check
   * @param {String} user_id User ID to check
   * @returns {Object|null} Task object if access is granted, null otherwise
   */
  async verify_task_access(task_id, user_id) {
    const task = await task_service.get_task({ entity_id: task_id, user_id })

    if (!task) {
      log(`Task ${task_id} not found for user ${user_id}`)
      return null
    }

    if (task.user_id !== user_id) {
      log(
        `Access denied: Task ${task_id} user ${task.user_id} does not match requesting user ${user_id}`
      )
      return null
    }

    return task
  },

  /**
   * Creates a standard error response
   * @param {String} operation Name of the operation that failed
   * @param {String} message Error message
   * @returns {Object} Standardized error response
   */
  error_response(operation, message) {
    return {
      success: false,
      error: message || `Failed to ${operation}`
    }
  }
}

/**
 * Format a task for efficient token usage and better inference
 * (Moved from libs-server/mcp/tasks/provider.mjs)
 * @param {Object} task The task to format
 * @returns {Object} Formatted task
 */
function format_task(task) {
  if (!task) return null

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
    // Renamed from tag_entity_ids to tag_ids for consistency
    // Note: The get_tasks function returns tag_entity_ids, which we'll treat as tag_ids
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
    return 'new' // Default or 'No status'
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

// 1. Get Task
register_tool({
  tool_name: 'task_get',
  tool_definition: {
    description: 'Retrieves details for a specific task by its ID.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: {
          type: 'string',
          description: 'The unique identifier (UUID) of the task to retrieve.'
        },
        user_id: {
          type: 'string',
          description:
            'Optional: User ID to check access against. Defaults to configured user.'
        }
      },
      required: ['task_id']
    }
  },
  implementation: async (parameters, context = {}) => {
    try {
      const { task_id } = parameters
      const user_id = helpers.resolve_user_id(parameters, context)

      log(`Getting task ${task_id} for user ${user_id}`)

      const task = await helpers.verify_task_access(task_id, user_id)

      if (!task) {
        return { task: null }
      }

      return { task: format_task(task) }
    } catch (error) {
      log(`Error getting task ${parameters.task_id}:`, error)
      return helpers.error_response('get task', error.message)
    }
  }
})

// 2. Get Filtered Tasks
register_tool({
  tool_name: 'task_get_filtered',
  tool_definition: {
    description: 'Retrieves a list of tasks filtered by various criteria.',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: {
          type: 'string',
          description:
            'Optional: User ID to filter tasks by. Defaults to configured user.'
        },
        status: {
          type: 'string',
          description: 'Optional: Task status to filter by.'
        },
        tag_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: Array of tag IDs to filter tasks by.'
        },
        organization_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: Array of organization IDs to filter tasks by.'
        },
        person_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: Array of person IDs to filter tasks by.'
        },
        min_finish_by: {
          type: 'string',
          format: 'date',
          description: 'Optional: Minimum finish by date (ISO 8601 format).'
        },
        max_finish_by: {
          type: 'string',
          format: 'date',
          description: 'Optional: Maximum finish by date (ISO 8601 format).'
        },
        include_completed: {
          type: 'boolean',
          description:
            'Optional: Whether to include completed tasks in the results. Defaults to false.',
          default: false
        }
      }
    }
  },
  implementation: async (parameters, context = {}) => {
    try {
      const {
        status,
        tag_ids,
        organization_ids,
        person_ids,
        min_finish_by,
        max_finish_by,
        include_completed = false
      } = parameters

      const user_id = helpers.resolve_user_id(parameters, context)

      log(`Getting filtered tasks for user ${user_id}`)

      // Call the get_tasks function from the task service
      const tasks = await task_service.get_tasks({
        user_id,
        status,
        tag_ids,
        organization_ids,
        person_ids,
        min_finish_by,
        max_finish_by,
        archived: include_completed // Invert the logic: archived=true means include_completed=true
      })

      // Apply display filtering if we're not including completed tasks
      let filtered_tasks = tasks
      if (!include_completed) {
        filtered_tasks = filter_displayable_tasks(tasks)
      }

      // Sort the tasks by importance
      const sorted_tasks = sort_tasks_by_importance(filtered_tasks)

      // Format tasks for response
      const formatted_tasks = sorted_tasks.map(format_task)

      return {
        success: true,
        count: formatted_tasks.length,
        tasks: formatted_tasks
      }
    } catch (error) {
      log('Error getting filtered tasks:', error)
      return helpers.error_response('get filtered tasks', error.message)
    }
  }
})

// 3. Create Task
register_tool({
  tool_name: 'task_create',
  tool_definition: {
    description: 'Creates a new task with the specified properties.',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: {
          type: 'string',
          description:
            'Optional: User ID to create the task for. Defaults to configured user.'
        },
        title: {
          type: 'string',
          description: 'The title of the task.'
        },
        description: {
          type: 'string',
          description: 'Optional: A description of the task.'
        },
        status: {
          type: 'string',
          description:
            'Optional: The status of the task. Defaults to TASK_STATUS.PLANNED.'
        },
        priority: {
          type: 'string',
          description:
            'Optional: The priority of the task. Defaults to TASK_PRIORITY.MEDIUM.'
        },
        finish_by: {
          type: 'string',
          format: 'date',
          description:
            'Optional: The date by which the task should be completed (ISO 8601 format).'
        },
        tag_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: Array of tag IDs to associate with the task.'
        },
        parent_task_ids: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional: Array of parent task IDs to associate with this task.'
        }
      },
      required: ['title']
    }
  },
  implementation: async (parameters, context = {}) => {
    try {
      const {
        title,
        description,
        status = TASK_STATUS.PLANNED,
        priority = TASK_PRIORITY.MEDIUM,
        finish_by,
        tag_ids = [],
        parent_task_ids = []
      } = parameters

      const user_id = helpers.resolve_user_id(parameters, context)

      log(`Creating new task "${title}" for user ${user_id}`)

      // Create task using task service
      const task_id = await task_service.create_task({
        user_id,
        title,
        description,
        status,
        priority,
        finish_by,
        tag_ids,
        parent_task_ids
      })

      if (!task_id) {
        return helpers.error_response(
          'create task',
          'Task creation returned no result'
        )
      }

      // Fetch the newly created task to return
      const task = await task_service.get_task({ entity_id: task_id, user_id })

      return {
        success: true,
        task: format_task(task)
      }
    } catch (error) {
      log('Error creating task:', error)
      return helpers.error_response('create task', error.message)
    }
  }
})

// 4. Update Task
register_tool({
  tool_name: 'task_update',
  tool_definition: {
    description: 'Updates an existing task with the specified properties.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: {
          type: 'string',
          description: 'The unique identifier (UUID) of the task to update.'
        },
        user_id: {
          type: 'string',
          description:
            'Optional: User ID to check access against. Defaults to configured user.'
        },
        title: {
          type: 'string',
          description: 'Optional: The new title of the task.'
        },
        description: {
          type: 'string',
          description: 'Optional: The new description of the task.'
        },
        status: {
          type: 'string',
          description: 'Optional: The new status of the task.'
        },
        priority: {
          type: 'string',
          description: 'Optional: The new priority of the task.'
        },
        finish_by: {
          type: 'string',
          format: 'date',
          description:
            'Optional: The new completion date for the task (ISO 8601 format).'
        },
        tag_ids: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional: New array of tag IDs to associate with the task.'
        },
        parent_task_ids: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional: New array of parent task IDs to associate with this task.'
        },
        blocking_task_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: New array of task IDs that this task blocks.'
        }
      },
      required: ['task_id']
    }
  },
  implementation: async (parameters, context = {}) => {
    try {
      const { task_id, ...updates } = parameters
      const user_id = helpers.resolve_user_id(parameters, context)

      log(`Updating task ${task_id} for user ${user_id}`)

      // First verify the user has access to this task
      const existing_task = await helpers.verify_task_access(task_id, user_id)

      if (!existing_task) {
        return helpers.error_response(
          'update task',
          'Task not found or access denied'
        )
      }

      // Update task using task service
      const updated_task_id = await task_service.update_task({
        task_id,
        user_id,
        ...updates
      })

      if (!updated_task_id) {
        return helpers.error_response(
          'update task',
          'Task update returned no result'
        )
      }

      // Fetch the updated task to return
      const updated_task = await task_service.get_task({
        entity_id: updated_task_id,
        user_id
      })

      return {
        success: true,
        task: format_task(updated_task)
      }
    } catch (error) {
      log(`Error updating task ${parameters.task_id}:`, error)
      return helpers.error_response('update task', error.message)
    }
  }
})

// 5. Delete Task
register_tool({
  tool_name: 'task_delete',
  tool_definition: {
    description: 'Deletes a task by its ID.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: {
          type: 'string',
          description: 'The unique identifier (UUID) of the task to delete.'
        },
        user_id: {
          type: 'string',
          description:
            'Optional: User ID to check access against. Defaults to configured user.'
        },
        permanent: {
          type: 'boolean',
          description:
            'Optional: Whether to permanently delete the task (true) or mark it as archived (false). Defaults to false.',
          default: false
        }
      },
      required: ['task_id']
    }
  },
  implementation: async (parameters, context = {}) => {
    try {
      const { task_id, permanent = false } = parameters
      const user_id = helpers.resolve_user_id(parameters, context)

      log(
        `Deleting task ${task_id} for user ${user_id} (permanent: ${permanent})`
      )

      // First verify the user has access to this task
      const existing_task = await helpers.verify_task_access(task_id, user_id)

      if (!existing_task) {
        return helpers.error_response(
          'delete task',
          'Task not found or access denied'
        )
      }

      // Delete task using task service
      const success = await task_service.delete_task({
        task_id,
        user_id,
        permanent
      })

      if (!success) {
        return helpers.error_response('delete task', 'Task deletion failed')
      }

      return {
        success: true,
        message: permanent
          ? `Task ${task_id} permanently deleted`
          : `Task ${task_id} archived`
      }
    } catch (error) {
      log(`Error deleting task ${parameters.task_id}:`, error)
      return helpers.error_response('delete task', error.message)
    }
  }
})
