import debug from 'debug'
import { register_tool } from '#libs-server/tools/registry.mjs'
import list_threads from '#libs-server/threads/list-threads.mjs'

const log = debug('tools:threads')

register_tool({
  tool_name: 'list_threads',
  tool_definition: {
    description:
      'Retrieves a list of threads from the filesystem with optional filtering by user, state, and pagination.',
    inputSchema: {
      type: 'object',
      properties: {
        user_public_key: {
          type: 'string',
          description:
            'Optional: User public key to filter threads by. Defaults to configured user.'
        },
        thread_state: {
          type: 'string',
          description: 'Optional: Filter by thread state'
        },
        limit: {
          type: 'number',
          description:
            'Optional: Maximum number of threads to return. Defaults to 50.',
          default: 50
        },
        offset: {
          type: 'number',
          description: 'Optional: Number of threads to skip. Defaults to 0.',
          default: 0
        },
        user_base_directory: {
          type: 'string',
          description:
            'Optional: Custom user base directory (overrides registry)'
        }
      }
    }
  },
  implementation: async (parameters, context = {}) => {
    try {
      const {
        user_public_key,
        thread_state,
        limit = 50,
        offset = 0,
        user_base_directory
      } = parameters

      log(
        `Getting filtered threads from filesystem${user_public_key ? ` for user ${user_public_key}` : ''}${thread_state ? ` with state ${thread_state}` : ''}`
      )

      const threads = await list_threads({
        user_public_key,
        thread_state,
        limit,
        offset,
        user_base_directory
      })

      return {
        success: true,
        count: threads.length,
        threads
      }
    } catch (error) {
      log('Error getting filtered threads from filesystem:', error)
      return {
        success: false,
        error: `Failed to list threads: ${error.message}`
      }
    }
  }
})
