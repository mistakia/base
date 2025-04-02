/**
 * Task tool definitions for MCP
 */

import config from '#config'

export const TASK_TOOLS = [
  {
    name: 'task_get_filtered',
    description: 'Get filtered and sorted tasks based on display criteria',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: {
          type: 'string',
          description:
            'ID of the user to get tasks for (defaults to main user)',
          default: config.user_id
        },
        include_completed: {
          type: 'boolean',
          description: 'Whether to include completed tasks',
          default: false
        },
        tag_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional tag IDs to filter by',
          default: []
        },
        organization_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional organization IDs to filter by',
          default: []
        },
        person_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional person IDs to filter by',
          default: []
        },
        min_finish_by: {
          type: 'string',
          description: 'Optional minimum finish by date',
          format: 'date-time'
        },
        max_finish_by: {
          type: 'string',
          description: 'Optional maximum finish by date',
          format: 'date-time'
        }
      }
    }
  },
  {
    name: 'task_get',
    description: 'Get a specific task by ID with all related data',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: {
          type: 'string',
          description: 'ID of the task to retrieve'
        },
        user_id: {
          type: 'string',
          description: 'ID of the user requesting the task'
        }
      },
      required: ['task_id', 'user_id']
    }
  }
]
