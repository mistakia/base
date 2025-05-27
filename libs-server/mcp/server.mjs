import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import debug from 'debug'
import { z } from 'zod'

import { list_tools, execute_tool } from '#libs-server/tools/index.mjs'
import { format_response, format_error } from '#libs-server/mcp/utils.mjs'

const logger = debug('mcp')
logger('Model Context Protocol initialized')

// Create a single MCP server
const mcp_server = new Server(
  {
    name: 'mcp-server',
    version: '1.0.0'
  },
  {
    capabilities: {
      tools: {},
      resources: {}
    }
  }
)

// Add handleRequest method to the server object
mcp_server.handleRequest = async function (request) {
  logger('Handling request: %O', request)
  try {
    // Get the current request handler
    const handler = this.requestHandler
    if (!handler) {
      throw new Error('No request handler registered')
    }

    // Call the handler with the request
    return await handler(request)
  } catch (error) {
    logger('Error handling request: %O', error)
    throw error
  }
}

// Add a request interceptor for debugging
mcp_server.setRequestHandler(
  z.object({
    method: z.string(),
    params: z.any()
  }),
  async (request) => {
    logger('Received request: %O', request)
    // Let the request continue to be handled by other handlers
    return undefined
  },
  { priority: -1 }
)

// Get all registered tools
const ALL_TOOLS = list_tools()

// Combine resources from all providers
const ALL_RESOURCES = []
const ALL_RESOURCE_TEMPLATES = []

// Convert tools array to capabilities format
const tools_capabilities = {}
ALL_TOOLS.forEach((tool) => {
  tools_capabilities[tool.name] = {
    description: tool.description,
    inputSchema: tool.inputSchema
  }
})

// List tools handler
mcp_server.setRequestHandler(
  z.object({
    method: z.literal('tools/list')
  }),
  async () => {
    logger('Handling tools/list request')
    return {
      tools: ALL_TOOLS
    }
  }
)

// List resources handler
mcp_server.setRequestHandler(
  z.object({
    method: z.literal('resources/list')
  }),
  async () => {
    logger('Handling resources/list request')
    return {
      resources: ALL_RESOURCES
    }
  }
)

mcp_server.setRequestHandler(
  z.object({
    method: z.literal('resources/templates/list')
  }),
  async () => {
    logger('Handling resources/templates/list request')
    return {
      resourceTemplates: ALL_RESOURCE_TEMPLATES
    }
  }
)

// Define a single handler for all tools
mcp_server.setRequestHandler(
  z.object({
    method: z.literal('tools/call'),
    params: z.object({
      name: z.string(),
      arguments: z.any()
    })
  }),
  async (request, extra) => {
    logger('Handling tools/call request: %O', request)
    const { name, arguments: parameters } = request.params

    try {
      const result = await execute_tool({
        tool_name: name,
        parameters,
        context: extra // Pass the extra object as context to the tool
      })
      logger('Tool call result: %O', result)

      // Format the response for MCP
      if (result.status === 'error') {
        return format_error(name, new Error(result.error))
      } else {
        return format_response(result.data)
      }
    } catch (error) {
      logger('Error processing tool call: %O', error)
      return format_error(name, error)
    }
  }
)

// Add initialize handler
mcp_server.setRequestHandler(
  z.object({
    method: z.literal('initialize'),
    params: z.object({
      protocolVersion: z.string().default('2024-11-05'),
      capabilities: z.any().optional(),
      clientInfo: z.any().optional()
    })
  }),
  async (request) => {
    logger('Handling initialize request: %O', request)
    const { protocolVersion } = request.params
    logger(`Client requested protocol version: ${protocolVersion}`)

    return {
      protocolVersion: '2024-11-05',
      serverInfo: {
        name: 'mcp-server',
        version: '1.0.0'
      },
      capabilities: {
        tools: tools_capabilities,
        resources: {
          // Resources don't need the same capabilities format as tools
        }
      }
    }
  }
)

// Export the server
export { mcp_server }
