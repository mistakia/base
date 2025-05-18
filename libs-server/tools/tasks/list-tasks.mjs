import debug from 'debug'
import { register_tool } from '#libs-server/tools/registry.mjs'
import { helpers, format_task } from './helpers.mjs'
import { list_tasks_in_filesystem } from '#libs-server/task/filesystem/list-tasks-in-filesystem.mjs'
import { TASK_STATUS } from '#libs-shared/task-constants.mjs'

const log = debug('tools:tasks')

register_tool({
  tool_name: 'list_tasks',
  tool_definition: {
    description:
      'Retrieves a list of tasks from the filesystem filtered by various criteria.',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: {
          type: 'string',
          description:
            'Optional: User ID to filter tasks by. Defaults to configured user.'
        },
        include_status: {
          type: 'array',
          description: 'Optional: Array of statuses to include',
          items: {
            type: 'string'
          }
        },
        exclude_status: {
          type: 'array',
          description: 'Optional: Array of statuses to exclude',
          items: {
            type: 'string'
          }
        },
        include_priority: {
          type: 'array',
          description: 'Optional: Array of priorities to include',
          items: {
            type: 'string'
          }
        },
        exclude_priority: {
          type: 'array',
          description: 'Optional: Array of priorities to exclude',
          items: {
            type: 'string'
          }
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
        include_status,
        exclude_status = [],
        include_priority,
        exclude_priority,
        include_completed = false
      } = parameters

      const user_id = helpers.resolve_user_id(parameters, context)

      log(`Getting filtered tasks from filesystem for user ${user_id}`)

      // Add 'completed' to exclude_status if include_completed is false
      const final_exclude_status = include_completed
        ? exclude_status
        : [...new Set([...exclude_status, TASK_STATUS.COMPLETED])]

      // Call the list_tasks_in_filesystem function
      const tasks_from_filesystem = await list_tasks_in_filesystem({
        include_status,
        exclude_status: final_exclude_status,
        include_priority,
        exclude_priority
      })

      // Format tasks for response
      const formatted_tasks = tasks_from_filesystem.map(format_task)

      return {
        success: true,
        count: formatted_tasks.length,
        tasks: formatted_tasks
      }
    } catch (error) {
      log('Error getting filtered tasks from filesystem:', error)
      return helpers.error_response(
        'get filtered tasks from filesystem',
        error.message
      )
    }
  }
})
