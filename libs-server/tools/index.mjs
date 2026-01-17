/**
 * Central tool definitions for Base
 *
 * This module serves as the single source of truth for tool definitions
 * that can be used:
 * 1. By the Model Context Protocol (MCP) for external agents
 * 2. By internal Execution Threads
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

// Register tools
// import './notion/index.mjs'
// Task, thread, and file tools removed - use entity-list CLI instead
import './entity/index.mjs'
import '../threads/thread-tools.mjs'

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
