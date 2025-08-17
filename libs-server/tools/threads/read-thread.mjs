import debug from 'debug'
import { register_tool } from '#libs-server/tools/registry.mjs'
import get_thread from '#libs-server/threads/get-thread.mjs'

const log = debug('tools:threads:read-thread')

// Helper function to parse string arrays from MCP parameters
function parse_string_array(value) {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    return value.split(',').map(s => s.trim()).filter(s => s.length > 0)
  }
  return []
}

register_tool({
  tool_name: 'thread_read',
  tool_definition: {
    description:
      'Retrieve thread data by ID with comprehensive timeline filtering capabilities. Supports filtering by entry types, message roles, tool names, sidechain status, and flexible slicing options.',
    inputSchema: {
      type: 'object',
      properties: {
        thread_id: {
          type: 'string',
          description: 'Thread ID to retrieve (required)'
        },
        user_public_key: {
          type: 'string',
          description: 'Optional: User public key for permission checking. Defaults to configured user.'
        },
        user_base_directory: {
          type: 'string',
          description: 'Optional: Custom user base directory (overrides registry)'
        },
        include_types: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: Timeline entry types to include (empty means all). Common types: message, tool_call, tool_response, metadata_update'
        },
        exclude_types: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: Timeline entry types to exclude'
        },
        include_roles: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: Message roles to include (empty means all). Common roles: user, assistant, system'
        },
        exclude_roles: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: Message roles to exclude'
        },
        include_tool_names: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: Tool names to include (empty means all). Only applies to tool_call entries'
        },
        exclude_tool_names: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: Tool names to exclude. Only applies to tool_call entries'
        },
        include_sidechain: {
          type: 'boolean',
          description: 'Optional: Whether to include sidechain entries. Defaults to true',
          default: true
        },
        limit: {
          type: 'number',
          description: 'Optional: Limit number of timeline entries (pagination approach). Cannot be combined with position-based or index-based slicing'
        },
        offset: {
          type: 'number',
          description: 'Optional: Offset for timeline entries (requires limit). Cannot be combined with position-based or index-based slicing'
        },
        take_first: {
          type: 'number',
          description: 'Optional: Take first N entries (position-based approach). Cannot be combined with pagination or index-based slicing'
        },
        take_last: {
          type: 'number',
          description: 'Optional: Take last N entries (position-based approach). Cannot be combined with pagination or index-based slicing'
        },
        skip_first: {
          type: 'number',
          description: 'Optional: Skip first N entries (position-based approach). Cannot be combined with pagination or index-based slicing'
        },
        skip_last: {
          type: 'number',
          description: 'Optional: Skip last N entries (position-based approach). Cannot be combined with pagination or index-based slicing'
        },
        start_index: {
          type: 'number',
          description: 'Optional: Start index for slicing (index-based approach). Cannot be combined with pagination or position-based slicing'
        },
        end_index: {
          type: 'number',
          description: 'Optional: End index for slicing (index-based approach). Cannot be combined with pagination or position-based slicing'
        }
      },
      required: ['thread_id']
    }
  },
  implementation: async (parameters, context = {}) => {
    try {
      const {
        thread_id,
        user_public_key,
        user_base_directory,
        include_types,
        exclude_types,
        include_roles,
        exclude_roles,
        include_tool_names,
        exclude_tool_names,
        include_sidechain = true,
        limit,
        offset,
        take_first,
        take_last,
        skip_first,
        skip_last,
        start_index,
        end_index
      } = parameters

      log(`Reading thread ${thread_id} with filtering parameters`)

      // Parse array parameters (handle both arrays and comma-separated strings)
      const parsed_include_types = parse_string_array(include_types)
      const parsed_exclude_types = parse_string_array(exclude_types)
      const parsed_include_roles = parse_string_array(include_roles)
      const parsed_exclude_roles = parse_string_array(exclude_roles)
      const parsed_include_tool_names = parse_string_array(include_tool_names)
      const parsed_exclude_tool_names = parse_string_array(exclude_tool_names)

      const thread_data = await get_thread({
        thread_id,
        user_public_key,
        user_base_directory,
        include_types: parsed_include_types,
        exclude_types: parsed_exclude_types,
        include_roles: parsed_include_roles,
        exclude_roles: parsed_exclude_roles,
        include_tool_names: parsed_include_tool_names,
        exclude_tool_names: parsed_exclude_tool_names,
        include_sidechain,
        limit,
        offset,
        take_first,
        take_last,
        skip_first,
        skip_last,
        start_index,
        end_index
      })

      return {
        success: true,
        thread_data,
        timeline_count: thread_data.timeline ? thread_data.timeline.length : 0,
        filter_applied: {
          types: {
            include: parsed_include_types,
            exclude: parsed_exclude_types
          },
          roles: {
            include: parsed_include_roles,
            exclude: parsed_exclude_roles
          },
          tool_names: {
            include: parsed_include_tool_names,
            exclude: parsed_exclude_tool_names
          },
          include_sidechain,
          slicing: {
            limit,
            offset,
            take_first,
            take_last,
            skip_first,
            skip_last,
            start_index,
            end_index
          }
        }
      }
    } catch (error) {
      log('Error reading thread:', error)
      return {
        success: false,
        error: `Failed to read thread: ${error.message}`
      }
    }
  }
})
