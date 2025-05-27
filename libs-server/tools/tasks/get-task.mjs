import debug from 'debug'
import { register_tool } from '#libs-server/tools/registry.mjs'
import { helpers } from './helpers.mjs'

const log = debug('tools:tasks')

// 1. Get Task
register_tool({
  tool_name: 'task_get',
  tool_definition: {
    description:
      'Retrieves details for a specific task by its base_relative_path.',
    inputSchema: {
      type: 'object',
      properties: {
        base_relative_path: {
          type: 'string',
          description:
            'The base relative path of the task file (e.g., user/tasks/my-task.md).'
        },
        user_id: {
          type: 'string',
          description:
            'Optional: User ID. Currently not used for access check for filesystem reads but kept for consistency.'
        }
      },
      required: ['base_relative_path']
    }
  },
  implementation: async (parameters, context = {}) => {
    try {
      const { base_relative_path } = parameters
      const user_id = helpers.resolve_user_id(parameters, context) // Kept for consistency, not used in verify for now

      log(`Getting task ${base_relative_path} for user ${user_id}`)

      const task = await helpers.verify_task_access(base_relative_path, user_id)

      if (!task) {
        return {
          task: null,
          error: `Task ${base_relative_path} not found or access denied.`
        }
      }

      return { task }
    } catch (error) {
      log(`Error getting task ${parameters.base_relative_path}:`, error)
      return helpers.error_response('get task', error.message)
    }
  }
})
