/**
 * Central tool registry functionality
 *
 * This module contains only the registry and functions, without importing tool modules.
 */

import debug from 'debug'

const log = debug('base:tools')

// Registry to store all tool definitions
const tool_registry = new Map()

/**
 * Register a tool with the central registry
 *
 * @param {string} tool_name - Unique name of the tool
 * @param {Object} tool_definition - Tool schema and metadata
 * @param {Object} tool_definition.description - Human-readable description
 * @param {Object} tool_definition.inputSchema - JSON Schema for input parameters
 * @param {Function} implementation - Function that implements the tool
 */
export function register_tool({ tool_name, tool_definition, implementation }) {
  if (tool_registry.has(tool_name)) {
    log(`Warning: Tool "${tool_name}" already registered, overwriting`)
  }

  // Validate required fields
  if (!tool_definition.description) {
    throw new Error(`Tool "${tool_name}" missing required description`)
  }

  if (!tool_definition.inputSchema) {
    throw new Error(`Tool "${tool_name}" missing required inputSchema`)
  }

  if (implementation && typeof implementation !== 'function') {
    throw new Error(`Tool "${tool_name}" implementation must be a function`)
  }

  // Store the tool definition
  tool_registry.set(tool_name, {
    name: tool_name,
    description: tool_definition.description,
    inputSchema: tool_definition.inputSchema,
    stops_execution: tool_definition.stops_execution || false,
    implementation
  })

  log(`Registered tool: ${tool_name}`)
  return true
}

/**
 * Get a tool definition by name
 *
 * @param {Object} params - Parameters
 * @param {string} params.tool_name - Name of the tool to retrieve
 * @returns {Object|null} Tool definition or null if not found
 */
export function get_tool({ tool_name }) {
  return tool_registry.get(tool_name) || null
}

/**
 * Get metadata for a registered tool
 *
 * @param {Object} params - Parameters
 * @param {string} params.tool_name - Name of the tool
 * @returns {Object|null} Tool metadata or null if not found
 */
export function get_tool_metadata({ tool_name }) {
  const tool = tool_registry.get(tool_name)
  return tool
    ? {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      }
    : null
}

/**
 * Check if a tool exists
 *
 * @param {Object} params - Parameters
 * @param {string} params.tool_name - Name of the tool to check
 * @returns {boolean} Whether the tool exists
 */
export function has_tool({ tool_name }) {
  return tool_registry.has(tool_name)
}

/**
 * List all registered tools
 *
 * @returns {Array<Object>} Array of tool definitions
 */
export function list_tools() {
  return Array.from(tool_registry.values()).map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema
  }))
}

/**
 * Convert tool metadata to prompt function text format
 *
 * @param {Object} params - Parameters
 * @param {string} params.tool_name - Name of the tool to convert
 * @returns {Object} Prompt function representation of the tool or null if not found
 */
export function tool_to_prompt_function({ tool_name }) {
  const tool = tool_registry.get(tool_name)

  if (!tool) {
    return null
  }

  // Convert inputSchema to parameters format
  const parameters = {
    properties: { ...tool.inputSchema.properties },
    required: tool.inputSchema.required || []
  }

  // Create function representation
  return {
    name: tool.name,
    description: tool.description,
    parameters
  }
}

/**
 * Execute a registered tool
 *
 * @param {Object} params - Execution parameters
 * @param {string} params.tool_name - Name of the tool to execute
 * @param {Object} params.parameters - Input parameters for the tool
 * @param {string} [params.thread_id] - Optional thread ID for context
 * @param {Object} [params.context={}] - Additional execution context
 * @returns {Promise<Object>} Tool execution result
 */
export async function execute_tool({
  tool_name,
  parameters,
  thread_id,
  context = {}
}) {
  const tool = tool_registry.get(tool_name)

  if (!tool) {
    throw new Error(`Tool not found: ${tool_name}`)
  }

  if (!tool.implementation) {
    throw new Error(`Tool "${tool_name}" has no implementation`)
  }

  log(`Executing tool: ${tool_name}`)

  try {
    const start_time = Date.now()

    // Execute the tool
    const result = await tool.implementation(parameters, {
      thread_id,
      ...context
    })

    const duration = Date.now() - start_time
    log(`Tool ${tool_name} executed in ${duration}ms`)

    return {
      status: 'success',
      data: result,
      execution_time: duration
    }
  } catch (error) {
    log(`Error executing tool ${tool_name}: ${error.message}`)

    return {
      status: 'error',
      error: error.message,
      details: error.stack
    }
  }
}
