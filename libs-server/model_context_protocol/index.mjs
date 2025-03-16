// Model Context Protocol main entry point
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import debug from 'debug'
import { z } from 'zod'
import { list_providers, process_request } from './service.mjs'

// Import all providers
import { NOTION_TOOLS } from './notion/index.mjs'
// Add more provider imports here as they become available

const logger = debug('mcp')
logger('Model Context Protocol initialized')

// Log registered providers
const providers = list_providers()
logger(`Registered MCP providers: ${providers.join(', ') || 'none'}`)

// Create a single MCP server that combines all providers
const mcp_server = new Server(
  {
    name: 'mcp-server',
    version: '1.0.0'
  },
  {
    capabilities: {
      tools: {}
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

// Combine tools from all providers
const ALL_TOOLS = [
  ...NOTION_TOOLS
  // Add more tools from other providers here
]

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

// Define a single handler for all tools
mcp_server.setRequestHandler(
  z.object({
    method: z.literal('tools/call'),
    params: z.object({
      name: z.string(),
      arguments: z.any()
    })
  }),
  async (request) => {
    logger('Handling tools/call request: %O', request)
    const { name, arguments: args } = request.params

    // Determine which provider should handle this tool
    let provider_name = 'notion' // Default to notion

    // Route the request to the appropriate provider
    if (name.startsWith('notion_')) {
      provider_name = 'notion'
    }
    // Add more provider routing logic here

    // Process the request using the provider
    try {
      const result = await process_request(provider_name, {
        method: 'tools/call',
        params: {
          name,
          arguments: args
        }
      })
      logger('Tool call result: %O', result)
      return result
    } catch (error) {
      logger('Error processing tool call: %O', error)
      throw error
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
        tools: tools_capabilities
      }
    }
  }
)

// Export the server
export { mcp_server }
