#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { create_mcp_server } from '#libs-server/mcp/server.mjs'

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
    // Parse command line arguments using yargs
    const argv = yargs(hideBin(process.argv))
      .option('tools', {
        alias: 'whitelist',
        type: 'array',
        description: 'Comma-separated list of tool names to include',
        coerce: (arg) => {
          // Handle both array input and comma-separated string input
          if (Array.isArray(arg)) {
            return arg
              .flatMap((item) =>
                typeof item === 'string'
                  ? item.split(',').map((tool) => tool.trim())
                  : item
              )
              .filter((tool) => tool.length > 0)
          }
          return arg
        }
      })
      .example('$0', 'Start server with all tools (default)')
      .example(
        '$0 --tools file_read,task_create,file_write',
        'Start server with only specific tools'
      )
      .example(
        '$0 --whitelist file_read,task_create',
        'Alternative syntax using whitelist alias'
      )
      .help('h')
      .alias('h', 'help').argv

    const tool_whitelist = argv.tools

    // Log configuration
    if (tool_whitelist) {
      logger(
        `Creating MCP server with tool whitelist: ${tool_whitelist.join(', ')}`
      )
    } else {
      logger('Creating MCP server with all available tools')
    }

    // Create server with optional tool filtering
    const mcp_server = create_mcp_server({ tool_whitelist })

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
