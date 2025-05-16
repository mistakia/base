/**
 * Task tools for the centralized tool registry
 */

import debug from 'debug'
import { register_tool } from '#libs-server/tools/registry.mjs'
import config from '#config'
// Import the new task functions
import {
  list_tasks_from_database,
  read_task_from_filesystem,
  write_task_to_git // For creating tasks in git
} from '#libs-server/task/index.mjs'
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
   * Verifies a user has access to a task file
   * @param {String} base_relative_path Task base relative path to check
   * @param {String} user_id User ID to check (currently not used for filesystem access, but good for future)
   * @returns {Object|null} Task object if access is granted (or file exists), null otherwise
   */
  async verify_task_access(base_relative_path, user_id) {
    // For now, we read from filesystem. Git read might be needed later.
    const task_result = await read_task_from_filesystem({ base_relative_path })

    if (!task_result.success || !task_result.entity_properties) {
      log(`Task ${base_relative_path} not found or error reading it.`)
      return null
    }

    // TODO: Add user_id check when task files store user_id or when reading from DB that has user_id
    // if (task_result.entity_properties.user_id !== user_id) {
    //   log(
    //     `Access denied: Task ${base_relative_path} user ${task_result.entity_properties.user_id} does not match requesting user ${user_id}`
    //   )
    //   return null
    // }

    return {
      base_relative_path,
      ...task_result.entity_properties,
      content: task_result.entity_content,
      // map entity_id from properties to task_id for format_task
      task_id: task_result.entity_properties.entity_id
    }
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
 * @param {Object} task The task to format (expects properties from list_tasks_from_database or verify_task_access)
 * @returns {Object} Formatted task
 */
function format_task(task) {
  if (!task) return null

  const {
    task_id, // This will be entity_id from list_tasks_from_database or mapped in verify_task_access
    title,
    description,
    status,
    priority,
    finish_by,
    started_at,
    finished_at,
    parent_task_ids: raw_parent_task_ids,
    child_task_ids: raw_child_task_ids,
    blocking_task_ids: raw_blocking_task_ids,
    tag_entity_ids: raw_tag_entity_ids, // from list_tasks_from_database
    blocked_task_ids: raw_blocked_task_ids
  } = task

  const parent_task_ids = raw_parent_task_ids?.filter(Boolean) || []
  const child_task_ids = raw_child_task_ids?.filter(Boolean) || []
  const blocking_task_ids = raw_blocking_task_ids?.filter(Boolean) || []
  const blocked_task_ids = raw_blocked_task_ids?.filter(Boolean) || []
  const tag_ids = raw_tag_entity_ids?.filter(Boolean) || [] // Use tag_entity_ids as tag_ids

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

  const priority_context = (() => {
    if (priority === TASK_PRIORITY.CRITICAL) return 'urgent'
    if (priority === TASK_PRIORITY.HIGH) return 'important'
    if (priority === TASK_PRIORITY.MEDIUM) return 'normal'
    if (priority === TASK_PRIORITY.LOW) return 'optional'
    return 'unspecified'
  })()

  const format_date = (date) =>
    date ? new Date(date).toISOString().split('T')[0] : null

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

  return {
    id: task_id,
    title,
    ...(description && { description: description.substring(0, 280) }),
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

      return { task: format_task(task) }
    } catch (error) {
      log(`Error getting task ${parameters.base_relative_path}:`, error)
      return helpers.error_response('get task', error.message)
    }
  }
})

// 2. Get Filtered Tasks
register_tool({
  tool_name: 'task_get_filtered',
  tool_definition: {
    description:
      'Retrieves a list of tasks from the database filtered by various criteria.',
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
        tag_entity_ids: {
          type: 'array',
          description:
            'Array of tag entity IDs to filter tasks by (UUID format)',
          items: {
            type: 'string'
          }
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
        tag_entity_ids,
        organization_ids,
        person_ids,
        min_finish_by,
        max_finish_by,
        include_completed = false // This maps to `archived` in the service layer
      } = parameters

      const user_id = helpers.resolve_user_id(parameters, context)

      log(`Getting filtered tasks from database for user ${user_id}`)

      // Call the list_tasks_from_database function
      const tasks_from_db = await list_tasks_from_database({
        user_id,
        status,
        tag_entity_ids,
        organization_ids,
        person_ids,
        min_finish_by,
        max_finish_by,
        archived: include_completed // `archived: true` means completed tasks are included
      })

      // Apply display filtering if we're not including completed tasks
      let filtered_tasks = tasks_from_db
      if (!include_completed) {
        filtered_tasks = filter_displayable_tasks(tasks_from_db)
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
      log('Error getting filtered tasks from database:', error)
      return helpers.error_response(
        'get filtered tasks from database',
        error.message
      )
    }
  }
})

// 3. Create Task
register_tool({
  tool_name: 'task_create',
  tool_definition: {
    description:
      'Creates a new task file in Git with the specified properties.',
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
          description:
            'Optional: A description of the task (will be the file content).'
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
        // Relations like tags, parent_tasks etc. are not directly supported by write_task_to_git for simplicity
        // They would typically be part of the frontmatter/content which can be extended.
        branch: {
          type: 'string',
          description:
            'The Git branch to write the task file to. Defaults to config.git.default_branch.'
        },
        commit_message: {
          type: 'string',
          description: 'Optional: Custom commit message.'
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
        description = '', // Task content
        status = TASK_STATUS.PLANNED,
        priority = TASK_PRIORITY.MEDIUM,
        finish_by,
        branch = config.git.default_branch, // Default branch from config
        commit_message
      } = parameters

      const user_id = helpers.resolve_user_id(parameters, context) // For logging and future use

      log(
        `Creating new task file "${title}" at ${base_relative_path} in branch ${branch} for user ${user_id}`
      )

      const task_properties = {
        title,
        // description will be task_content
        status,
        priority,
        ...(finish_by && { finish_by })
        // user_id is not a standard entity property for the file itself yet.
      }

      const result = await write_task_to_git({
        base_relative_path,
        task_properties,
        task_content: description, // description becomes the main content of the .md file
        branch,
        commit_message,
        root_base_directory: config.root_base_directory // Assuming this is needed
      })

      if (!result.success) {
        return helpers.error_response(
          'create task file in Git',
          result.error || 'Task creation in Git returned no success'
        )
      }

      // Fetch the newly created task to return (from filesystem for now)
      // This assumes that after git write, the file is available on the filesystem for read_task_from_filesystem
      // This might need adjustment if git operations are on a remote or detached worktree.
      const new_task_data = await read_task_from_filesystem({
        base_relative_path
      })
      if (!new_task_data.success) {
        log(`Could not read back task ${base_relative_path} after git write.`)
        return {
          success: true, // Git write was successful
          message: `Task file ${base_relative_path} created in Git. SHA: ${result.commit_sha}. Could not read back for formatted response.`,
          details: result
        }
      }

      return {
        success: true,
        message: `Task file ${base_relative_path} created in Git. SHA: ${result.commit_sha}`,
        task: format_task({
          base_relative_path,
          ...new_task_data.entity_properties,
          task_id: new_task_data.entity_properties.entity_id, // map for format_task
          description: new_task_data.entity_content // format_task expects description
        }),
        git_result: result
      }
    } catch (error) {
      log('Error creating task file in Git:', error)
      return helpers.error_response('create task file in Git', error.message)
    }
  }
})

// 4. Update Task
register_tool({
  tool_name: 'task_update',
  tool_definition: {
    description:
      'Updates an existing task. TODO: This tool is not yet fully implemented with new task functions.',
    inputSchema: {
      type: 'object',
      properties: {
        base_relative_path: {
          type: 'string',
          description: 'The base relative path of the task file to update.'
        },
        user_id: {
          type: 'string',
          description: 'Optional: User ID. Defaults to configured user.'
        },
        title: {
          type: 'string',
          description: 'Optional: The new title of the task.'
        }
        // TODO: Add other updatable properties like description, status, priority, etc.
      },
      required: ['base_relative_path']
    }
  },
  implementation: async (parameters, context = {}) => {
    const { base_relative_path } = parameters
    log(`TODO: Implement task_update for ${base_relative_path}`)
    return {
      success: false,
      message:
        'task_update tool is not yet implemented with new task functions. Please check back later.',
      error: 'Not Implemented'
      // TODO: Placeholder - actual implementation needed using write_task_to_filesystem or write_task_to_git
      // const user_id = helpers.resolve_user_id(parameters, context)
      // const existing_task = await helpers.verify_task_access(base_relative_path, user_id)
      // if (!existing_task) { ... }
      // const result = await write_task_to_git({ base_relative_path, task_properties: updates, branch: 'main' ... });
      // return { success: result.success, task: format_task(updated_task_data) }
    }
  }
})

// 5. Delete Task
register_tool({
  tool_name: 'task_delete',
  tool_definition: {
    description:
      'Deletes a task file. TODO: This tool is not yet fully implemented with new task functions.',
    inputSchema: {
      type: 'object',
      properties: {
        base_relative_path: {
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
        // TODO: Consider how archiving (soft delete) works for file-based tasks vs DB tasks.
        // For now, permanent=true will mean actual file deletion.
      },
      required: ['base_relative_path']
    }
  },
  implementation: async (parameters, context = {}) => {
    const { base_relative_path, permanent = true } = parameters
    log(
      `TODO: Implement task_delete for ${base_relative_path} (permanent: ${permanent})`
    )
    return {
      success: false,
      message:
        'task_delete tool is not yet implemented with new task functions. Please check back later.',
      error: 'Not Implemented'
      // TODO: Placeholder - actual implementation needed using something like delete_file_from_git_or_filesystem or delete_entity_from_git
      // const user_id = helpers.resolve_user_id(parameters, context)
      // const existing_task = await helpers.verify_task_access(base_relative_path, user_id) // to ensure it exists and for auth if needed
      // if (!existing_task) { ... }
      // if (permanent) { const result = await delete_file_from_git_or_filesystem({ base_relative_path }); return { success: result.success }}
      // else { // handle archiving, e.g. move to an archive folder or update frontmatter }
    }
  }
})
