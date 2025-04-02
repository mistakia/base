import debug from 'debug'

import { register_provider } from '#libs-server/mcp/service.mjs'
import db from '#db'
import config from '#config'

// Setup logger
const logger = debug('mcp:database')

// ===== Tool Definitions =====
export const DB_TOOLS = [
  {
    name: 'db_query',
    description: 'Execute a read-only SQL query against the database',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The SQL query to execute (SELECT only)'
        },
        params: {
          type: 'array',
          description: 'Query parameters',
          items: {
            type: 'string'
          }
        },
        limit: {
          type: 'number',
          description: 'Maximum number of rows to return',
          default: 100
        }
      },
      required: ['query']
    }
  },
  {
    name: 'db_get_table_schema',
    description: 'Get the schema definition for a specific table',
    inputSchema: {
      type: 'object',
      properties: {
        table_name: {
          type: 'string',
          description: 'The name of the table'
        }
      },
      required: ['table_name']
    }
  },
  {
    name: 'db_list_tables',
    description: 'List all tables in the database',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
]

// ===== Resource Definitions =====
export const DB_RESOURCES = [
  {
    uri: 'db://schema/tables',
    name: 'Database Tables',
    description: 'List of all tables in the database with their descriptions',
    mimeType: 'application/json'
  }
]

// ===== Resource Template Definitions =====
export const DB_RESOURCE_TEMPLATES = [
  {
    uriTemplate: 'db://schema/table/{table_name}',
    name: 'Table Schema',
    description: 'Schema definition for a specific table',
    mimeType: 'application/json'
  },
  {
    uriTemplate: 'db://data/{table_name}',
    name: 'Table Data',
    description: 'Data from a specific table (limited to 100 rows)',
    mimeType: 'application/json'
  }
]

// ===== Handler Implementation =====
const database_handler = {
  async handle_request(request) {
    logger('Handling database request: %O', request)
    const { method, params } = request

    try {
      // Handle different request methods
      switch (method) {
        case 'tools/call':
          return await handle_tool_call(params)
        case 'resources/read':
          return await handle_resource_read(params)
        case 'resources/list':
          return await handle_resource_list()
        case 'resourceTemplates/list':
          return await handle_resource_templates_list()
        default:
          throw new Error(`Unsupported method: ${method}`)
      }
    } catch (error) {
      logger('Error in database handler: %O', error)
      throw error
    }
  }
}

// Handle tool calls
async function handle_tool_call(params) {
  const { name, arguments: args } = params

  switch (name) {
    case 'db_query':
      return await execute_query(args)
    case 'db_get_table_schema':
      return await get_table_schema(args)
    case 'db_list_tables':
      return await list_tables()
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

// Handle resource reads
async function handle_resource_read(params) {
  const { uri } = params
  logger(`Reading resource: ${uri}`)

  // Parse the URI to determine what to return
  if (uri === 'db://schema/tables') {
    const tables = await get_all_tables_schema()
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(tables, null, 2)
        }
      ]
    }
  }

  // Handle table schema resource
  const table_schema_match = uri.match(/^db:\/\/schema\/table\/(.+)$/)
  if (table_schema_match) {
    const table_name = table_schema_match[1]
    const schema = await get_detailed_table_schema(table_name)
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(schema, null, 2)
        }
      ]
    }
  }

  // Handle table data resource
  const table_data_match = uri.match(/^db:\/\/data\/(.+)$/)
  if (table_data_match) {
    const table_name = table_data_match[1]
    const data = await get_table_data(table_name)
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(data, null, 2)
        }
      ]
    }
  }

  throw new Error(`Unknown resource URI: ${uri}`)
}

// Handle resource listing
async function handle_resource_list() {
  return {
    resources: DB_RESOURCES
  }
}

// Handle resource template listing
async function handle_resource_templates_list() {
  return {
    resourceTemplates: DB_RESOURCE_TEMPLATES
  }
}

// ===== Tool Implementation Functions =====

async function execute_query({ query, params = [], limit = 100 }) {
  // Validate query is read-only
  if (!query.trim().toLowerCase().startsWith('select')) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: 'Only SELECT queries are allowed for security reasons.'
        }
      ]
    }
  }

  try {
    // Add limit to query if not present
    let safe_query = query
    if (!safe_query.toLowerCase().includes('limit')) {
      safe_query += ` LIMIT ${limit}`
    }

    // Use knex.raw for direct SQL queries
    const result = await db.raw(safe_query, params)
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              rows: result.rows,
              rowCount: result.rowCount
            },
            null,
            2
          )
        }
      ]
    }
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Database error: ${error.message}`
        }
      ]
    }
  }
}

async function get_table_schema({ table_name }) {
  try {
    const schema = await get_detailed_table_schema(table_name)
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(schema, null, 2)
        }
      ]
    }
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Error getting table schema: ${error.message}`
        }
      ]
    }
  }
}

async function list_tables() {
  try {
    const tables = await get_all_tables_schema()
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(tables, null, 2)
        }
      ]
    }
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Error listing tables: ${error.message}, ${config.base_hostname}`
        }
      ]
    }
  }
}

// ===== Helper Functions =====

async function get_all_tables_schema() {
  const result = await db.raw(`
    SELECT 
      t.tablename as table_name,
      obj_description(pgc.oid, 'pg_class') as table_description
    FROM 
      pg_catalog.pg_tables t
    JOIN 
      pg_catalog.pg_class pgc ON t.tablename = pgc.relname
    WHERE 
      schemaname = 'public'
    ORDER BY 
      1;
  `)
  return result.rows
}

async function get_detailed_table_schema(table_name) {
  // Get column information
  const column_query = `
    SELECT 
      column_name, 
      data_type,
      is_nullable,
      column_default,
      pg_catalog.col_description(format('%s.%s',table_schema,table_name)::regclass::oid, ordinal_position) as column_description
    FROM 
      information_schema.columns
    WHERE 
      table_schema = 'public' AND table_name = ?
    ORDER BY 
      ordinal_position;
  `

  // Get constraint information
  const constraint_query = `
    SELECT
      tc.constraint_name,
      tc.constraint_type,
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name
    FROM
      information_schema.table_constraints tc
    JOIN
      information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    LEFT JOIN
      information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
    WHERE
      tc.table_schema = 'public' AND tc.table_name = ?;
  `

  const [columns_result, constraints_result] = await Promise.all([
    db.raw(column_query, [table_name]),
    db.raw(constraint_query, [table_name])
  ])

  return {
    table_name,
    columns: columns_result.rows,
    constraints: constraints_result.rows
  }
}

async function get_table_data(table_name) {
  // Validate table name to prevent SQL injection
  const valid_result = await db.raw(
    `
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = ?
    );
  `,
    [table_name]
  )

  if (!valid_result.rows[0].exists) {
    throw new Error(`Table '${table_name}' does not exist`)
  }

  // Use knex query builder instead of raw SQL
  const result = await db(table_name).select('*').limit(100)

  return {
    table_name,
    rows: result,
    count: result.length
  }
}

// Register the database provider
register_provider('database', database_handler)

// Export the handler for testing
export { database_handler }
