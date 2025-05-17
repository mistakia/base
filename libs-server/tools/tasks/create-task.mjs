import debug from 'debug'
import { register_tool } from '#libs-server/tools/registry.mjs'
import { helpers, format_task } from './helpers.mjs'
import { write_task_to_filesystem } from '#libs-server/task/filesystem/write-task-to-filesystem.mjs'
import { read_task_from_filesystem } from '#libs-server/task/filesystem/read-task-from-filesystem.mjs'
import { TASK_STATUS, TASK_PRIORITY } from '#libs-shared/task-constants.mjs'
import config from '#config'

const log = debug('tools:tasks')

// 3. Create Task
register_tool({
  tool_name: 'task_create',
  tool_definition: {
    description:
      'Creates a new task file in the filesystem with the specified properties.',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: {
          type: 'string',
          description:
            'Optional: User ID for ownership/context. Defaults to configured user. Not directly stored in file properties yet.'
        },
        base_relative_path: {
          type: 'string',
          description:
            'The base relative path for the new task file (e.g., user/tasks/my-new-task.md).'
        },
        title: {
          type: 'string',
          description: 'The title of the task.'
        },
        description: {
          type: 'string',
          description: 'A description of the task.'
        },
        task_content: {
          type: 'string',
          description: 'The content of the task file (markdown).'
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
        }
      },
      required: ['base_relative_path', 'title']
    }
  },
  implementation: async (parameters, context = {}) => {
    try {
      const {
        base_relative_path,
        title,
        description,
        status = TASK_STATUS.PLANNED,
        priority = TASK_PRIORITY.MEDIUM,
        finish_by,
        task_content
      } = parameters

      const user_id = helpers.resolve_user_id(parameters, context) // For logging and future use

      log(
        `Creating new task file "${title}" at ${base_relative_path} for user ${user_id}`
      )

      const task_properties = {
        title,
        description,
        status,
        priority,
        ...(finish_by && { finish_by })
        // user_id is not a standard entity property for the file itself yet.
      }

      const result = await write_task_to_filesystem({
        base_relative_path,
        task_properties,
        task_content
      })

      if (!result.success) {
        return helpers.error_response(
          'create task file',
          result.error || 'Task creation returned no success'
        )
      }

      // Fetch the newly created task to return
      const new_task_data = await read_task_from_filesystem({
        base_relative_path
      })
      if (!new_task_data.success) {
        log(`Could not read back task ${base_relative_path} after write.`)
        return {
          success: true, // Write was successful
          message: `Task file ${base_relative_path} created. Could not read back for formatted response.`,
          details: result
        }
      }

      return {
        success: true,
        message: `Task file ${base_relative_path} created.`,
        task: format_task(new_task_data)
      }
    } catch (error) {
      log('Error creating task file:', error)
      return helpers.error_response('create task file', error.message)
    }
  }
})
