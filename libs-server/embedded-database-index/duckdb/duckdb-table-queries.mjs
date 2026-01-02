/**
 * DuckDB Table Queries
 *
 * Query functions for tasks and threads with react-table filter/sort support.
 */

import debug from 'debug'
import { execute_duckdb_query } from './duckdb-database-client.mjs'

const log = debug('embedded-index:duckdb:queries')

// Map client filter operators to SQL operators
// Keys match TABLE_OPERATORS values from react-table (e.g., 'NOT IN' with space)
const FILTER_OPERATOR_MAP = {
  '=': '=',
  '!=': '!=',
  '>': '>',
  '>=': '>=',
  '<': '<',
  '<=': '<=',
  LIKE: 'LIKE',
  'NOT LIKE': 'NOT LIKE',
  IN: 'IN',
  'NOT IN': 'NOT IN',
  'IS NULL': 'IS NULL',
  'IS NOT NULL': 'IS NOT NULL',
  IS_EMPTY: "= ''",
  IS_NOT_EMPTY: "!= ''"
}

export function build_duckdb_where_clause({ filters, column_types = {} }) {
  if (!filters || filters.length === 0) {
    return { where_sql: '', parameters: [] }
  }

  const conditions = []
  const parameters = []

  for (const filter of filters) {
    const { column_id, operator, value } = filter

    if (!column_id || !operator) {
      continue
    }

    const sql_operator = FILTER_OPERATOR_MAP[operator]
    if (!sql_operator) {
      log('Unknown filter operator: %s', operator)
      continue
    }

    // Handle special operators that don't need values
    if (operator === 'IS NULL' || operator === 'IS NOT NULL') {
      conditions.push(`${column_id} ${sql_operator}`)
      continue
    }

    if (operator === 'IS_EMPTY' || operator === 'IS_NOT_EMPTY') {
      conditions.push(`(${column_id} IS NULL OR ${column_id} ${sql_operator})`)
      continue
    }

    // Handle IN and NOT IN operators
    if (operator === 'IN' || operator === 'NOT IN') {
      if (Array.isArray(value) && value.length > 0) {
        const placeholders = value.map(() => '?').join(', ')
        conditions.push(`${column_id} ${sql_operator} (${placeholders})`)
        parameters.push(...value)
      }
      continue
    }

    // Handle LIKE operators
    if (operator === 'LIKE' || operator === 'NOT LIKE') {
      conditions.push(`${column_id} ${sql_operator} ?`)
      parameters.push(`%${value}%`)
      continue
    }

    // Handle standard comparison operators
    conditions.push(`${column_id} ${sql_operator} ?`)
    parameters.push(value)
  }

  const where_sql =
    conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  return { where_sql, parameters }
}

/**
 * Priority sort order mapping for CASE expression
 * Maps priority strings to numeric values for semantic sorting
 * Critical (4) > High (3) > Medium (2) > Low (1) > None (0)
 */
const PRIORITY_CASE_EXPRESSION = `
  CASE priority
    WHEN 'Critical' THEN 4
    WHEN 'High' THEN 3
    WHEN 'Medium' THEN 2
    WHEN 'Low' THEN 1
    WHEN 'None' THEN 0
    ELSE 0
  END`

export function build_duckdb_order_clause({ sort }) {
  if (!sort || sort.length === 0) {
    return ''
  }

  const order_parts = sort.map(({ column_id, desc }) => {
    const direction = desc ? 'DESC' : 'ASC'

    // Use CASE expression for priority to ensure semantic ordering
    if (column_id === 'priority') {
      return `${PRIORITY_CASE_EXPRESSION} ${direction} NULLS LAST`
    }

    return `${column_id} ${direction} NULLS LAST`
  })

  return `ORDER BY ${order_parts.join(', ')}`
}

export async function query_tasks_from_duckdb({
  connection,
  filters = [],
  sort = [],
  limit = 1000,
  offset = 0
}) {
  log('Querying tasks from DuckDB')

  const { where_sql, parameters } = build_duckdb_where_clause({ filters })
  const order_sql = build_duckdb_order_clause({ sort })

  const query = `
    SELECT
      entity_id, base_uri, title, status, priority, description,
      created_at, updated_at, start_by, finish_by,
      planned_start, planned_finish, started_at, finished_at,
      snooze_until, estimated_total_duration, archived, user_public_key
    FROM tasks
    ${where_sql}
    ${order_sql}
    LIMIT ? OFFSET ?
  `

  try {
    const results = await execute_duckdb_query({
      query,
      parameters: [...parameters, limit, offset]
    })

    log('Found %d tasks', results.length)
    return results
  } catch (error) {
    log('Error querying tasks: %s', error.message)
    throw error
  }
}

export async function query_threads_from_duckdb({
  connection,
  filters = [],
  sort = [],
  limit = 1000,
  offset = 0
}) {
  log('Querying threads from DuckDB')

  const { where_sql, parameters } = build_duckdb_where_clause({ filters })
  const order_sql = build_duckdb_order_clause({ sort })

  const query = `
    SELECT
      thread_id, title, short_description, thread_state, created_at, updated_at,
      message_count, user_message_count, assistant_message_count, tool_call_count,
      total_input_tokens, total_output_tokens, cache_creation_input_tokens,
      cache_read_input_tokens, total_tokens, duration_ms, duration_minutes,
      working_directory, working_directory_path, session_provider, user_public_key
    FROM threads
    ${where_sql}
    ${order_sql}
    LIMIT ? OFFSET ?
  `

  try {
    const results = await execute_duckdb_query({
      query,
      parameters: [...parameters, limit, offset]
    })

    log('Found %d threads', results.length)
    return results
  } catch (error) {
    log('Error querying threads: %s', error.message)
    throw error
  }
}

export async function count_tasks_in_duckdb({ connection, filters = [] }) {
  log('Counting tasks in DuckDB')

  const { where_sql, parameters } = build_duckdb_where_clause({ filters })

  const query = `SELECT COUNT(*) as count FROM tasks ${where_sql}`

  try {
    const results = await execute_duckdb_query({ query, parameters })
    const count_value = results[0]?.count
    // Convert BigInt to Number if necessary
    const count =
      typeof count_value === 'bigint' ? Number(count_value) : count_value || 0
    log('Task count: %d', count)
    return count
  } catch (error) {
    log('Error counting tasks: %s', error.message)
    throw error
  }
}

export async function count_threads_in_duckdb({ connection, filters = [] }) {
  log('Counting threads in DuckDB')

  const { where_sql, parameters } = build_duckdb_where_clause({ filters })

  const query = `SELECT COUNT(*) as count FROM threads ${where_sql}`

  try {
    const results = await execute_duckdb_query({ query, parameters })
    const count_value = results[0]?.count
    // Convert BigInt to Number if necessary
    const count =
      typeof count_value === 'bigint' ? Number(count_value) : count_value || 0
    log('Thread count: %d', count)
    return count
  } catch (error) {
    log('Error counting threads: %s', error.message)
    throw error
  }
}

export async function query_tasks_by_tag({
  connection,
  tag_base_uri,
  filters = [],
  sort = [],
  limit = 1000,
  offset = 0
}) {
  log('Querying tasks by tag: %s', tag_base_uri)

  const { where_sql, parameters } = build_duckdb_where_clause({ filters })
  const order_sql = build_duckdb_order_clause({ sort })

  // Modify WHERE clause to include tag filter
  const tag_condition =
    'EXISTS (SELECT 1 FROM entity_tags et WHERE et.entity_base_uri = tasks.base_uri AND et.tag_base_uri = ?)'
  const final_where = where_sql
    ? `${where_sql} AND ${tag_condition}`
    : `WHERE ${tag_condition}`

  const query = `
    SELECT
      entity_id, base_uri, title, status, priority, description,
      created_at, updated_at, archived, user_public_key
    FROM tasks
    ${final_where}
    ${order_sql}
    LIMIT ? OFFSET ?
  `

  try {
    const results = await execute_duckdb_query({
      query,
      parameters: [...parameters, tag_base_uri, limit, offset]
    })

    log('Found %d tasks with tag', results.length)
    return results
  } catch (error) {
    log('Error querying tasks by tag: %s', error.message)
    throw error
  }
}
