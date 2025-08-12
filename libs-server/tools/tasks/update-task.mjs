import debug from 'debug'
import { register_tool } from '#libs-server/tools/registry.mjs'
import { helpers, format_task } from './helpers.mjs'
import { write_task_to_filesystem } from '#libs-server/task/filesystem/write-task-to-filesystem.mjs'
import { read_task_from_filesystem } from '#libs-server/task/filesystem/read-task-from-filesystem.mjs'

const log = debug('tools:tasks')

// 4. Update Task
register_tool({
  tool_name: 'task_update',
  tool_definition: {
    description: 'Updates an existing task file in the filesystem.',
    inputSchema: {
      type: 'object',
      properties: {
        base_uri: {
          type: 'string',
          description: 'The base relative path of the task file to update.'
        },
        user_public_key: {
          type: 'string',
          description: 'Optional: User public key. Defaults to configured user.'
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
          description: 'Optional: The new finish by date (ISO 8601 format).'
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
      )

      log(`Updating task ${base_uri} for user ${user_public_key}`)

      // First read the existing task
      const existing_task = await helpers.verify_task_access(
        base_uri,
        user_public_key
      )
      if (!existing_task) {
        return helpers.error_response(
          'update task',
          `Task ${base_uri} not found or access denied.`
        )
      }

      // Prepare updates by merging existing properties with new ones
      const task_properties = {
        ...existing_task.entity_properties,
        ...parameters
      }

      const result = await write_task_to_filesystem({
        base_uri,
        task_properties,
        task_content: parameters.description || existing_task.content
      })

      if (!result.success) {
        return helpers.error_response(
          'update task',
          result.error || 'Task update returned no success'
        )
      }

      // Fetch the updated task to return
      const updated_task_data = await read_task_from_filesystem({
        base_uri
      })
      if (!updated_task_data.success) {
        log(`Could not read back task ${base_uri} after update.`)
        return {
          success: true, // Update was successful
          message: `Task file ${base_uri} updated. Could not read back for formatted response.`,
          details: result
        }
      }

      return {
        success: true,
        message: `Task file ${base_uri} updated.`,
        task: format_task(updated_task_data)
      }
    } catch (error) {
      log('Error updating task file:', error)
      return helpers.error_response('update task file', error.message)
    }
  }
})
