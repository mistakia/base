import { Client } from '@notionhq/client'
import debug from 'debug'

import { register_provider } from '#libs-server/mcp/service.mjs'
import { format_response, format_error } from '#libs-server/mcp/utils.mjs'
import config from '#config'

// Setup logger
const logger = debug('mcp:notion')

// Initialize Notion client
const notion = new Client({
  auth: config.notion?.api_key || process.env.NOTION_API_KEY
})

// ===== Tool Definitions =====
const NOTION_TOOLS = [
  {
    name: 'notion_search',
    description: 'Search for pages and databases in Notion',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query'
        },
        page_size: {
          type: 'number',
          description: 'Number of results to return',
          default: 10
        }
      },
      required: ['query']
    }
  },
  {
    name: 'notion_list_databases',
    description: 'List all databases the integration has access to',
    inputSchema: {
      type: 'object',
      properties: {
        start_cursor: {
          type: 'string',
          description: 'Cursor for pagination'
        },
        page_size: {
          type: 'number',
          description: 'Number of results per page',
          default: 100
        }
      }
    }
  },
  {
    name: 'notion_get_page',
    description: 'Get a Notion page by ID',
    inputSchema: {
      type: 'object',
      properties: {
        page_id: {
          type: 'string',
          description: 'The ID of the page to retrieve'
        }
      },
      required: ['page_id']
    }
  },
  {
    name: 'notion_get_database',
    description: 'Get a Notion database by ID',
    inputSchema: {
      type: 'object',
      properties: {
        database_id: {
          type: 'string',
          description: 'The ID of the database to retrieve'
        }
      },
      required: ['database_id']
    }
  },
  {
    name: 'notion_query_database',
    description: 'Query a database',
    inputSchema: {
      type: 'object',
      properties: {
        database_id: {
          type: 'string',
          description: 'ID of the database to query'
        },
        filter: {
          type: 'object',
          description: 'Optional filter criteria'
        },
        sorts: {
          type: 'array',
          description: 'Optional sort criteria'
        },
        start_cursor: {
          type: 'string',
          description: 'Optional cursor for pagination'
        },
        page_size: {
          type: 'number',
          description: 'Number of results per page',
          default: 100
        }
      },
      required: ['database_id']
    }
  },
  {
    name: 'notion_create_page',
    description: 'Create a new page in a database',
    inputSchema: {
      type: 'object',
      properties: {
        parent_id: {
          type: 'string',
          description: 'ID of the parent database'
        },
        properties: {
          type: 'object',
          description: 'Page properties'
        },
        children: {
          type: 'array',
          description: 'Optional content blocks'
        }
      },
      required: ['parent_id', 'properties']
    }
  },
  {
    name: 'notion_update_page',
    description: 'Update an existing page',
    inputSchema: {
      type: 'object',
      properties: {
        page_id: {
          type: 'string',
          description: 'ID of the page to update'
        },
        properties: {
          type: 'object',
          description: 'Updated page properties'
        },
        archived: {
          type: 'boolean',
          description: 'Whether to archive the page'
        }
      },
      required: ['page_id', 'properties']
    }
  },
  {
    name: 'notion_get_block_children',
    description: 'Retrieve the children blocks of a block',
    inputSchema: {
      type: 'object',
      properties: {
        block_id: {
          type: 'string',
          description: 'ID of the block (page or block)'
        },
        start_cursor: {
          type: 'string',
          description: 'Cursor for pagination'
        },
        page_size: {
          type: 'number',
          description: 'Number of results per page',
          default: 100
        }
      },
      required: ['block_id']
    }
  },
  {
    name: 'notion_append_block_children',
    description: 'Append blocks to a parent block',
    inputSchema: {
      type: 'object',
      properties: {
        block_id: {
          type: 'string',
          description: 'ID of the parent block (page or block)'
        },
        children: {
          type: 'array',
          description: 'List of block objects to append'
        },
        after: {
          type: 'string',
          description: 'Optional ID of an existing block to append after'
        }
      },
      required: ['block_id', 'children']
    }
  }
]

// ===== Helper Functions =====

/**
 * Clean an ID by removing dashes
 * @param {string} id - The ID to clean
 * @returns {string} Cleaned ID
 */
function clean_id(id) {
  return id ? id.replace(/-/g, '') : id
}

// ===== Tool Handlers =====

/**
 * Handle tool calls for the Notion MCP
 * @param {string} name - Tool name
 * @param {object} args - Tool arguments
 * @returns {Promise<object>} Tool response
 */
async function handle_tool_call(name, args) {
  try {
    switch (name) {
      case 'notion_search': {
        const response = await notion.search({
          query: args.query,
          page_size: args.page_size || 10,
          sort: {
            direction: 'descending',
            timestamp: 'last_edited_time'
          }
        })
        return format_response(response.results)
      }

      case 'notion_list_databases': {
        const { start_cursor, page_size } = args

        const search_params = {
          filter: {
            property: 'object',
            value: 'database'
          },
          page_size: page_size || 100
        }

        if (start_cursor) {
          search_params.start_cursor = start_cursor
        }

        const response = await notion.search(search_params)
        return format_response(response.results)
      }

      case 'notion_get_page': {
        const page_id = clean_id(args.page_id)
        const response = await notion.pages.retrieve({ page_id })
        return format_response(response)
      }

      case 'notion_get_database': {
        const database_id = clean_id(args.database_id)
        const response = await notion.databases.retrieve({ database_id })
        return format_response(response)
      }

      case 'notion_query_database': {
        const { filter, sorts, start_cursor, page_size } = args
        const database_id = clean_id(args.database_id)

        const query_params = {
          database_id,
          page_size: page_size || 100
        }

        if (filter) query_params.filter = filter
        if (sorts) query_params.sorts = sorts
        if (start_cursor) query_params.start_cursor = start_cursor

        const response = await notion.databases.query(query_params)
        return format_response(response)
      }

      case 'notion_create_page': {
        const { parent_id, properties, children } = args
        const clean_parent_id = clean_id(parent_id)

        const page_params = {
          parent: { database_id: clean_parent_id },
          properties
        }

        if (children) {
          page_params.children = children
        }

        const response = await notion.pages.create(page_params)
        return format_response(response)
      }

      case 'notion_update_page': {
        const { properties, archived } = args
        const page_id = clean_id(args.page_id)

        const update_params = {
          page_id,
          properties
        }

        if (archived !== undefined) {
          update_params.archived = archived
        }

        const response = await notion.pages.update(update_params)
        return format_response(response)
      }

      case 'notion_get_block_children': {
        const { start_cursor, page_size } = args
        const block_id = clean_id(args.block_id)

        const params = {
          block_id,
          page_size: page_size || 100
        }

        if (start_cursor) {
          params.start_cursor = start_cursor
        }

        const response = await notion.blocks.children.list(params)
        return format_response(response)
      }

      case 'notion_append_block_children': {
        const { children, after } = args
        const block_id = clean_id(args.block_id)

        const params = {
          block_id,
          children
        }

        if (after) {
          params.after = clean_id(after)
        }

        const response = await notion.blocks.children.append(params)
        return format_response(response)
      }

      default:
        return format_response(`Unknown tool: ${name}`, true)
    }
  } catch (error) {
    return format_error(name, error)
  }
}

async function handle_request(request) {
  logger('Handling HTTP request: %O', request)

  // Process the request based on method
  if (request.method === 'tools/list') {
    return {
      tools: NOTION_TOOLS
    }
  } else if (request.method === 'tools/call') {
    const { name, arguments: args } = request.params
    return await handle_tool_call(name, args)
  } else {
    throw new Error(`Unknown method: ${request.method}`)
  }
}

// Register the Notion provider with the MCP service
register_provider('notion', {
  handle_request
})

// Add error handling for unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  logger('Unhandled Rejection at: %o, reason: %o', promise, reason)
})

export { NOTION_TOOLS }
