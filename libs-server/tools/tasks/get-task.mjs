import debug from 'debug'
import { register_tool } from '#libs-server/tools/registry.mjs'
import { helpers } from './helpers.mjs'

const log = debug('tools:tasks')

// 1. Get Task
register_tool({
  tool_name: 'task_get',
  tool_definition: {
    description: 'Retrieves details for a specific task by its base_uri.',
    inputSchema: {
      type: 'object',
      properties: {
        base_uri: {
          type: 'string',
          description:
            'The base relative path of the task file (e.g., user/tasks/my-task.md).'
        },
        user_public_key: {
          type: 'string',
          description:
            'Optional: User public key. Currently not used for access check for filesystem reads but kept for consistency.'
        }
      },
      required: ['base_uri']
    }
  },
  implementation: async (parameters, context = {}) => {
    try {
      const { base_uri } = parameters
      const user_public_key = helpers.resolve_user_public_key(
        parameters,
        context
      ) // Kept for consistency, not used in verify for now

      log(`Getting task ${base_uri} for user ${user_public_key}`)

      const task = await helpers.verify_task_access(base_uri, user_public_key)

      if (!task) {
        return {
          task: null,
          error: `Task ${base_uri} not found or access denied.`
        }
      }

      return { task }
    } catch (error) {
      log(`Error getting task ${parameters.base_uri}:`, error)
      return helpers.error_response('get task', error.message)
    }
  }
})
