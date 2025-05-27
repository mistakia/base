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

// Register messaging tools
register_tool({
  tool_name: 'message_notify_creator',
  tool_definition: {
    description:
      'Send a message to creator without requiring a response. Use for acknowledging receipt of messages, providing progress updates, reporting task completion, or explaining changes in approach.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Message text to display to creator'
        },
        attachments: {
          anyOf: [
            { type: 'string' },
            { items: { type: 'string' }, type: 'array' }
          ],
          description:
            '(Optional) List of attachments to show to creator, can be file paths or URLs'
        }
      },
      required: ['text']
    }
  },
  implementation: async (parameters) => {
    // Placeholder implementation
    return {
      success: true,
      message: 'Notification sent to creator',
      data: parameters
    }
  }
})

register_tool({
  tool_name: 'message_ask_creator',
  tool_definition: {
    description:
      'Ask creator a question and wait for response. Use for requesting clarification, asking for confirmation, or gathering additional information.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Question text to present to creator'
        },
        attachments: {
          anyOf: [
            { type: 'string' },
            { items: { type: 'string' }, type: 'array' }
          ],
          description:
            '(Optional) List of question-related files or reference materials'
        },
        suggest_creator_takeover: {
          type: 'string',
          enum: ['none', 'browser'],
          description: '(Optional) Suggested operation for creator takeover'
        }
      },
      required: ['text']
    }
  },
  implementation: async (parameters) => {
    // Placeholder implementation
    return {
      success: true,
      message: 'Question sent to creator',
      waiting_for_response: true,
      data: parameters
    }
  }
})
