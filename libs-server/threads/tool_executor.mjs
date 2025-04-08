import debug from 'debug'

const log = debug('threads:tools')

// Registry of available tools
const tool_registry = new Map()

/**
 * Register a tool implementation
 *
 * @param {string} tool_name Name of the tool
 * @param {Function} implementation Tool implementation function
 * @param {Object} [metadata={}] Additional tool metadata
 */
export function register_tool(tool_name, implementation, metadata = {}) {
  if (typeof implementation !== 'function') {
    throw new Error(`Tool implementation for '${tool_name}' must be a function`)
  }

  tool_registry.set(tool_name, {
    name: tool_name,
    execute: implementation,
    metadata: {
      description: metadata.description || `Execute the ${tool_name} tool`,
      ...metadata
    }
  })

  log(`Registered tool: ${tool_name}`)
}

/**
 * Check if a tool is registered
 *
 * @param {string} tool_name Name of the tool
 * @returns {boolean} Whether the tool is registered
 */
export function has_tool(tool_name) {
  return tool_registry.has(tool_name)
}

/**
 * Get metadata for a registered tool
 *
 * @param {string} tool_name Name of the tool
 * @returns {Object|null} Tool metadata or null if not found
 */
export function get_tool_metadata(tool_name) {
  const tool = tool_registry.get(tool_name)
  return tool ? tool.metadata : null
}

/**
 * List all registered tools
 *
 * @returns {Array<Object>} Array of tool metadata objects
 */
export function list_tools() {
  return Array.from(tool_registry.values()).map((tool) => ({
    name: tool.name,
    ...tool.metadata
  }))
}

/**
 * Execute a tool
 *
 * @param {Object} params Parameters
 * @param {string} params.tool_name Name of the tool to execute
 * @param {Object} params.parameters Parameters to pass to the tool
 * @param {string} [params.thread_id] Optional thread ID for context
 * @param {Object} [params.context={}] Additional execution context
 * @returns {Promise<Object>} Tool execution result
 */
export async function execute_tool({
  tool_name,
  parameters,
  thread_id,
  context = {}
}) {
  if (!tool_name) {
    throw new Error('tool_name is required')
  }

  const tool = tool_registry.get(tool_name)

  if (!tool) {
    throw new Error(`Tool not found: ${tool_name}`)
  }

  log(`Executing tool: ${tool_name}`)

  try {
    const start_time = Date.now()

    // Execute the tool
    const result = await tool.execute(parameters, { thread_id, ...context })

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

// Register some basic example tools
register_tool(
  'echo',
  async (parameters) => {
    return parameters
  },
  {
    description: 'Echo back the input parameters',
    example: {
      message: 'Hello, world!'
    }
  }
)

register_tool(
  'calculator',
  async (parameters) => {
    if (!parameters.expression) {
      throw new Error('expression parameter is required')
    }

    // SECURITY: Evaluating arbitrary expressions is dangerous
    // In a real implementation, use a safe math evaluation library
    try {
      // Extremely basic expression evaluation (UNSAFE FOR PRODUCTION)
      // eslint-disable-next-line no-eval
      const result = eval(parameters.expression)
      return { value: result }
    } catch (error) {
      throw new Error(`Invalid expression: ${error.message}`)
    }
  },
  {
    description: 'Evaluate a mathematical expression',
    example: {
      expression: '2 + 2'
    }
  }
)

export default {
  register_tool,
  has_tool,
  get_tool_metadata,
  list_tools,
  execute_tool
}
