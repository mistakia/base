#!/usr/bin/env node

import express from 'express'
import debug from 'debug'
import cors from 'cors'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { z } from 'zod'
import config from '#config'

// import { mcp_server } from '#libs-server/mcp/server.mjs'

// Configure debug logging
const logger = debug('mcp:standalone')
debug.enable('mcp:*')

// Create MCP server with proper capabilities
const mcp_server = new Server(
  {
    name: 'example-server',
    version: '1.0.0'
  },
  {
    capabilities: {
      tools: {
        echo: {
          description: 'Echoes back the input message',
          params: {
            type: 'object',
            properties: {
              message: {
                type: 'string',
                description: 'The message to echo back'
              }
            },
            required: ['message']
          }
        }
      }
    }
  }
)

// Add initialize handler with proper protocol version
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
    logger('Handling initialize request')
    const { protocolVersion } = request.params
    logger(`Client requested protocol version: ${protocolVersion}`)

    return {
      protocolVersion: '2024-11-05',
      serverInfo: {
        name: 'example-server',
        version: '1.0.0'
      },
      capabilities: {
        tools: {
          echo: {
            description: 'Echoes back the input message',
            params: {
              type: 'object',
              properties: {
                message: {
                  type: 'string',
                  description: 'The message to echo back'
                }
              },
              required: ['message']
            }
          }
        }
      }
    }
  }
)

// Add echo tool handler
mcp_server.setRequestHandler(
  z.object({
    method: z.literal('tools/echo'),
    params: z.object({
      message: z.string()
    })
  }),
  async (request) => {
    const { message } = request.params
    logger(`Echoing message: ${message}`)
    return {
      content: [{ type: 'text', text: `Echo: ${message}` }]
    }
  }
)

// Set the port for the MCP server
const mcp_port = 3100

// Create a standalone Express app for MCP
const app = express()

// Restricted CORS configuration matching main server
const allowed_origins = new Set(
  [
    config.public_url || '',
    'http://localhost:8080',
    'https://localhost:8080',
    'http://localhost:8081',
    'https://localhost:8081'
  ].filter(Boolean)
)

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like curl or server-side requests)
      if (!origin) return callback(null, true)

      if (!allowed_origins.has(origin)) {
        const msg =
          'The CORS policy for this site does not allow access from the specified Origin.'
        return callback(new Error(msg), false)
      }
      return callback(null, true)
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
)

// Parse JSON request bodies
app.use(express.json())

// Store active transport
app.locals.transport = null

// Create SSE endpoint
app.get('/sse', async (req, res) => {
  // Set headers for SSE
  //   res.setHeader('Content-Type', 'text/event-stream')
  //   res.setHeader('Cache-Control', 'no-cache')
  //   res.setHeader('Connection', 'keep-alive')

  // Create transport with the response object
  const transport = new SSEServerTransport('/messages', res)

  // Connect the server to the transport
  await mcp_server.connect(transport).catch((error) => {
    logger(`Error connecting server to transport: ${error}`)
  })

  // Store the transport
  app.locals.transport = transport

  logger('SSE connection established')

  // Handle client disconnect
  //   req.on('close', () => {
  //     logger('SSE connection closed')
  //     app.locals.transport = null
  //   })
})

// Create endpoint for receiving messages
app.post('/messages', async (req, res) => {
  logger('Received message:', req.body)

  // Check if we have an active transport
  if (!app.locals.transport) {
    res.status(400).send('No active transport found')
    return
  }

  try {
    await app.locals.transport.handlePostMessage(req, res)
  } catch (error) {
    logger(`Error handling POST message: ${error}`)
    res.status(500).send(`Error handling message: ${error.message}`)
  }
})

// Start the server
app.listen(mcp_port, () => {
  logger(`MCP standalone server listening on port ${mcp_port}`)
})
