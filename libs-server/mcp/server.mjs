import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import debug from 'debug'
import { z } from 'zod'
import { list_providers, process_request } from './service.mjs'

import { NOTION_TOOLS } from './notion/index.mjs'
import {
  DB_TOOLS,
  DB_RESOURCES,
  DB_RESOURCE_TEMPLATES
} from './database/index.mjs'
import { GIT_TOOLS } from './git/index.mjs'

const logger = debug('mcp')
logger('Model Context Protocol initialized')

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

// Combine all tools and resources
const ALL_TOOLS = [...NOTION_TOOLS, ...DB_TOOLS, ...GIT_TOOLS]

// Combine resources from all providers
const ALL_RESOURCES = [
  ...DB_RESOURCES
  // Add more resources from other providers here
]

const ALL_RESOURCE_TEMPLATES = [
  ...DB_RESOURCE_TEMPLATES
  // Add more resource templates from other providers here
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
  async (request) => {
    logger('Handling tools/call request: %O', request)
    const { name, arguments: args } = request.params

    // Determine which provider should handle this tool
    let provider_name = 'notion' // Default to notion

    // Route the request to the appropriate provider
    if (name.startsWith('notion_')) {
      provider_name = 'notion'
    } else if (name.startsWith('db_')) {
      provider_name = 'database'
    } else if (name.startsWith('knowledge_base_')) {
      provider_name = 'git'
    }

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

// Define a handler for reading resources
mcp_server.setRequestHandler(
  z.object({
    method: z.literal('resources/read'),
    params: z.object({
      uri: z.string()
    })
  }),
  async (request) => {
    logger('Handling resources/read request: %O', request)
    const { uri } = request.params

    // Determine which provider should handle this resource
    const provider_name = 'database' // Default to database for resources

    // Process the request using the provider
    try {
      const result = await process_request(provider_name, {
        method: 'resources/read',
        params: {
          uri
        }
      })
      logger('Resource read result: %O', result)
      return result
    } catch (error) {
      logger('Error processing resource read: %O', error)
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
