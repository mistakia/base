/**
 * Notion tools for the centralized tool registry
 */

import { Client } from '@notionhq/client'
import debug from 'debug'
import { register_tool } from '#libs-server/tools/index.mjs'
import config from '#config'

// Setup logger
const log = debug('tools:notion')

// Initialize Notion client (only if API key is provided)
const notion = config.notion?.api_key
  ? new Client({ auth: config.notion.api_key })
  : null

/**
 * Clean an ID by removing dashes
 * @param {string} id - The ID to clean
 * @returns {string} Cleaned ID
 */
function clean_id(id) {
  return id ? id.replace(/-/g, '') : id
}

// Register Notion tools only if API key is configured
if (notion) {
  log('Registering Notion tools')

  // 1. Notion Search
  register_tool({
    tool_name: 'notion_search',
    tool_definition: {
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
    implementation: async (parameters) => {
      try {
        const response = await notion.search({
          query: parameters.query,
          page_size: parameters.page_size || 10,
          sort: {
            direction: 'descending',
            timestamp: 'last_edited_time'
          }
        })
        return response.results
      } catch (error) {
        throw new Error(`Notion search failed: ${error.message}`)
      }
    }
  })

  // 2. List Databases
  register_tool({
    tool_name: 'notion_list_databases',
    tool_definition: {
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
    implementation: async (parameters) => {
      try {
        const { start_cursor, page_size } = parameters

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
        return response.results
      } catch (error) {
        throw new Error(`Notion list databases failed: ${error.message}`)
      }
    }
  })

  // 3. Get Page
  register_tool({
    tool_name: 'notion_get_page',
    tool_definition: {
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
    implementation: async (parameters) => {
      try {
        const page_id = clean_id(parameters.page_id)
        const response = await notion.pages.retrieve({ page_id })
        return response
      } catch (error) {
        throw new Error(`Notion get page failed: ${error.message}`)
      }
    }
  })

  // 4. Get Database
  register_tool({
    tool_name: 'notion_get_database',
    tool_definition: {
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
    implementation: async (parameters) => {
      try {
        const database_id = clean_id(parameters.database_id)
        const response = await notion.databases.retrieve({ database_id })
        return response
      } catch (error) {
        throw new Error(`Notion get database failed: ${error.message}`)
      }
    }
  })

  // 5. Query Database
  register_tool({
    tool_name: 'notion_query_database',
    tool_definition: {
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
    implementation: async (parameters) => {
      try {
        const { filter, sorts, start_cursor, page_size } = parameters
        const database_id = clean_id(parameters.database_id)

        const query_params = {
          database_id,
          page_size: page_size || 100
        }

        if (filter) query_params.filter = filter
        if (sorts) query_params.sorts = sorts
        if (start_cursor) query_params.start_cursor = start_cursor

        const response = await notion.databases.query(query_params)
        return response
      } catch (error) {
        throw new Error(`Notion query database failed: ${error.message}`)
      }
    }
  })

  // 6. Create Page
  register_tool({
    tool_name: 'notion_create_page',
    tool_definition: {
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
    implementation: async (parameters) => {
      try {
        const { parent_id, properties, children } = parameters
        const clean_parent_id = clean_id(parent_id)

        const page_params = {
          parent: { database_id: clean_parent_id },
          properties
        }

        if (children) {
          page_params.children = children
        }

        const response = await notion.pages.create(page_params)
        return response
      } catch (error) {
        throw new Error(`Notion create page failed: ${error.message}`)
      }
    }
  })

  // 7. Update Page
  register_tool({
    tool_name: 'notion_update_page',
    tool_definition: {
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
    implementation: async (parameters) => {
      try {
        const { properties, archived } = parameters
        const page_id = clean_id(parameters.page_id)

        const update_params = {
          page_id,
          properties
        }

        if (archived !== undefined) {
          update_params.archived = archived
        }

        const response = await notion.pages.update(update_params)
        return response
      } catch (error) {
        throw new Error(`Notion update page failed: ${error.message}`)
      }
    }
  })

  // 8. Get Block Children
  register_tool({
    tool_name: 'notion_get_block_children',
    tool_definition: {
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
    implementation: async (parameters) => {
      try {
        const { start_cursor, page_size } = parameters
        const block_id = clean_id(parameters.block_id)

        const params = {
          block_id,
          page_size: page_size || 100
        }

        if (start_cursor) {
          params.start_cursor = start_cursor
        }

        const response = await notion.blocks.children.list(params)
        return response
      } catch (error) {
        throw new Error(`Notion get block children failed: ${error.message}`)
      }
    }
  })

  // 9. Append Block Children
  register_tool({
    tool_name: 'notion_append_block_children',
    tool_definition: {
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
    },
    implementation: async (parameters) => {
      try {
        const { children, after } = parameters
        const block_id = clean_id(parameters.block_id)

        const params = {
          block_id,
          children
        }

        if (after) {
          params.after = clean_id(after)
        }

        const response = await notion.blocks.children.append(params)
        return response
      } catch (error) {
        throw new Error(`Notion append block children failed: ${error.message}`)
      }
    }
  })
} else {
  log('Notion API key not found, skipping tool registration')
}
