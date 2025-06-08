import debug from 'debug'
import { register_tool } from '#libs-server/tools/registry.mjs'
import { helpers } from './helpers.mjs'
import { delete_file_in_filesystem } from '#libs-server/filesystem/delete-file-in-filesystem.mjs'
import { resolve_base_uri_from_registry } from '#libs-server/base-uri/index.mjs'

const log = debug('tools:tasks')

// 5. Delete Task
register_tool({
  tool_name: 'task_delete',
  tool_definition: {
    description: 'Deletes a task file from the filesystem.',
    inputSchema: {
      type: 'object',
      properties: {
        base_uri: {
          type: 'string',
          description: 'The base relative path of the task file to delete.'
        },
        user_id: {
          type: 'string',
          description: 'Optional: User ID. Defaults to configured user.'
        },
        permanent: {
          type: 'boolean',
          description:
            'Optional: Whether to permanently delete the task file (true) or handle archiving differently (false). Defaults to true for file deletion.',
          default: true
        }
      },
      required: ['base_uri']
    }
  },
  implementation: async (parameters, context = {}) => {
    try {
      const { base_uri, permanent = true } = parameters
      const user_id = helpers.resolve_user_id(parameters, context)

      log(
        `Deleting task ${base_uri} for user ${user_id} (permanent: ${permanent})`
      )

      // First verify access to the task
      const existing_task = await helpers.verify_task_access(base_uri, user_id)
      if (!existing_task) {
        return helpers.error_response(
          'delete task',
          `Task ${base_uri} not found or access denied.`
        )
      }

      if (!permanent) {
        // TODO: Implement archiving logic
        return {
          success: false,
          message: 'Task archiving is not yet implemented.',
          error: 'Not Implemented'
        }
      }

      // Get the absolute path for deletion using the registry
      const absolute_path = resolve_base_uri_from_registry(base_uri)

      // Delete the file
      const result = await delete_file_in_filesystem({
        file_path: absolute_path
      })
      if (!result.success) {
        return helpers.error_response(
          'delete task',
          result.error || 'Task deletion returned no success'
        )
      }

      return {
        success: true,
        message: `Task file ${base_uri} deleted.`
      }
    } catch (error) {
      log('Error deleting task file:', error)
      return helpers.error_response('delete task file', error.message)
    }
  }
})
