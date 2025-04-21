/**
 * Central tool definitions for Base
 *
 * This module serves as the single source of truth for tool definitions
 * that can be used:
 * 1. By the Model Context Protocol (MCP) for external agents
 * 2. By internal Base threads
 */

// Import and re-export all registry functions
import {
  register_tool,
  get_tool,
  get_tool_metadata,
  has_tool,
  list_tools,
  execute_tool
} from './registry.mjs'

// Import tool implementations
import './notion/index.mjs'
import './tasks/index.mjs'
import './file/index.mjs'

export {
  register_tool,
  get_tool,
  get_tool_metadata,
  has_tool,
  list_tools,
  execute_tool
}

// Export a default object with all functions
export default {
  register_tool,
  get_tool,
  get_tool_metadata,
  has_tool,
  list_tools,
  execute_tool
}

// Register built-in example tools
register_tool({
  tool_name: 'echo',
  tool_definition: {
    description: 'Echo back the input parameters',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'Message to echo'
        }
      }
    }
  },
  implementation: async (parameters) => {
    return parameters
  }
})
