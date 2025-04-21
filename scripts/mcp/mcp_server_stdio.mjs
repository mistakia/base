#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import debug from 'debug'
import { mcp_server } from '#libs-server/mcp/server.mjs'

// Configure debug logging
const logger = debug('mcp:stdio')

if (process.env.NODE_ENV !== 'test') {
  debug.enable('*')
}

// Create a stdio transport
const transport = new StdioServerTransport()

// Connect the server to the transport
async function main() {
  try {
    logger('Connecting server to stdio transport')
    await mcp_server.connect(transport)
    logger('Server connected to stdio transport')
  } catch (error) {
    logger(`Error connecting server to transport: ${error}`)
    process.exit(1)
  }
}

// Start the server
main()
