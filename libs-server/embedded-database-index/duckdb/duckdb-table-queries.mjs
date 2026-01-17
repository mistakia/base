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

/**
 * Combine base WHERE clause with additional conditions
 * Handles the logic of appending AND or creating new WHERE clause
 */
function combine_where_clauses({ base_where, additional_condition }) {
  if (!additional_condition) return base_where
  if (base_where) return `${base_where} AND ${additional_condition}`
  return `WHERE ${additional_condition}`
}

/**
 * Separate tag filters from regular filters and build tag conditions
 * Returns tag conditions SQL/parameters and the remaining regular filters
 *
 * @param {Object} params - Parameters
 * @param {Array} params.filters - Filter array
 * @param {string} [params.table_alias='t'] - Table alias for base_uri reference
 */
function separate_and_build_tag_filters({ filters, table_alias = 't' }) {
  const tag_filters = filters.filter((f) => f.column_id === 'tags')
  const regular_filters = filters.filter((f) => f.column_id !== 'tags')

  if (tag_filters.length === 0) {
    return {
      tag_conditions: { sql: '', parameters: [] },
      regular_filters
    }
  }

  const conditions = []
  const parameters = []

  for (const filter of tag_filters) {
    const { operator, value } = filter

    if (operator === 'IN' && Array.isArray(value) && value.length > 0) {
      // Entity has at least one of the specified tags
      const placeholders = value.map(() => '?').join(', ')
      conditions.push(
        `EXISTS (SELECT 1 FROM entity_tags et_filter WHERE et_filter.entity_base_uri = ${table_alias}.base_uri AND et_filter.tag_base_uri IN (${placeholders}))`
      )
      parameters.push(...value)
    } else if (
      operator === 'NOT IN' &&
      Array.isArray(value) &&
      value.length > 0
    ) {
      // Entity has none of the specified tags
      const placeholders = value.map(() => '?').join(', ')
      conditions.push(
        `NOT EXISTS (SELECT 1 FROM entity_tags et_filter WHERE et_filter.entity_base_uri = ${table_alias}.base_uri AND et_filter.tag_base_uri IN (${placeholders}))`
      )
      parameters.push(...value)
    } else if (operator === 'IS_EMPTY') {
      // Entity has no tags
      conditions.push(
        `NOT EXISTS (SELECT 1 FROM entity_tags et_filter WHERE et_filter.entity_base_uri = ${table_alias}.base_uri)`
      )
    } else if (operator === 'IS_NOT_EMPTY') {
      // Entity has at least one tag
      conditions.push(
        `EXISTS (SELECT 1 FROM entity_tags et_filter WHERE et_filter.entity_base_uri = ${table_alias}.base_uri)`
      )
    }
  }

  const sql = conditions.length > 0 ? conditions.join(' AND ') : ''
  return {
    tag_conditions: { sql, parameters },
    regular_filters
  }
}

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
  filters = [],
  sort = [],
  limit = 1000,
  offset = 0
}) {
  log('Querying tasks from DuckDB')

  const { tag_conditions, regular_filters } = separate_and_build_tag_filters({
    filters
  })
  const { where_sql, parameters } = build_duckdb_where_clause({
    filters: regular_filters
  })
  const order_sql = build_duckdb_order_clause({ sort })
  const final_where = combine_where_clauses({
    base_where: where_sql,
    additional_condition: tag_conditions.sql
  })

  const query = `
    SELECT
      t.entity_id, t.base_uri, t.title, t.status, t.priority, t.description,
      t.created_at, t.updated_at, t.start_by, t.finish_by,
      t.planned_start, t.planned_finish, t.started_at, t.finished_at,
      t.snooze_until, t.estimated_total_duration, t.archived, t.user_public_key,
      STRING_AGG(et.tag_base_uri, '||') AS tags_aggregated
    FROM tasks t
    LEFT JOIN entity_tags et ON et.entity_base_uri = t.base_uri
    ${final_where}
    GROUP BY
      t.entity_id, t.base_uri, t.title, t.status, t.priority, t.description,
      t.created_at, t.updated_at, t.start_by, t.finish_by,
      t.planned_start, t.planned_finish, t.started_at, t.finished_at,
      t.snooze_until, t.estimated_total_duration, t.archived, t.user_public_key
    ${order_sql}
    LIMIT ? OFFSET ?
  `

  try {
    const results = await execute_duckdb_query({
      query,
      parameters: [...parameters, ...tag_conditions.parameters, limit, offset]
    })

    // Parse tags_aggregated string into array (inline)
    const tasks_with_tags = results.map((task) => ({
      ...task,
      tags: task.tags_aggregated
        ? task.tags_aggregated.split('||').filter(Boolean)
        : []
    }))

    log('Found %d tasks', tasks_with_tags.length)
    return tasks_with_tags
  } catch (error) {
    log('Error querying tasks: %s', error.message)
    throw error
  }
}

export async function query_threads_from_duckdb({
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
      working_directory, working_directory_path, session_provider,
      inference_provider, primary_model, user_public_key
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

export async function count_tasks_in_duckdb({ filters = [] }) {
  log('Counting tasks in DuckDB')

  const { tag_conditions, regular_filters } = separate_and_build_tag_filters({
    filters
  })
  const { where_sql, parameters } = build_duckdb_where_clause({
    filters: regular_filters
  })
  const final_where = combine_where_clauses({
    base_where: where_sql,
    additional_condition: tag_conditions.sql
  })

  // Use alias 't' for tasks table to match tag filter conditions
  const query = `SELECT COUNT(*) as count FROM tasks t ${final_where}`

  try {
    const results = await execute_duckdb_query({
      query,
      parameters: [...parameters, ...tag_conditions.parameters]
    })
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

export async function count_threads_in_duckdb({ filters = [] }) {
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

/**
 * Transform entity result from database format to API format
 * Parses tags_aggregated and frontmatter JSON
 */
function transform_entity_result(entity) {
  return {
    ...entity,
    tags: entity.tags_aggregated
      ? entity.tags_aggregated.split('||').filter(Boolean)
      : [],
    frontmatter:
      typeof entity.frontmatter === 'string'
        ? JSON.parse(entity.frontmatter)
        : entity.frontmatter
  }
}

/**
 * Build entity query with tags aggregation
 */
function build_entity_query({ where_clause = '', order_clause = '' }) {
  return `
    SELECT
      e.base_uri, e.entity_id, e.type, e.title, e.description,
      e.status, e.priority, e.archived, e.user_public_key,
      e.created_at, e.updated_at, e.archived_at, e.frontmatter,
      STRING_AGG(et.tag_base_uri, '||') AS tags_aggregated
    FROM entities e
    LEFT JOIN entity_tags et ON et.entity_base_uri = e.base_uri
    ${where_clause}
    GROUP BY
      e.base_uri, e.entity_id, e.type, e.title, e.description,
      e.status, e.priority, e.archived, e.user_public_key,
      e.created_at, e.updated_at, e.archived_at, e.frontmatter
    ${order_clause}
  `
}

/**
 * Query entities from unified entities table
 */
export async function query_entities_from_duckdb({
  filters = [],
  sort = [],
  limit = 1000,
  offset = 0
}) {
  log('Querying entities from DuckDB')

  const { tag_conditions, regular_filters } = separate_and_build_tag_filters({
    filters,
    table_alias: 'e'
  })
  const { where_sql, parameters } = build_duckdb_where_clause({
    filters: regular_filters
  })
  const order_sql = build_duckdb_order_clause({ sort })
  const final_where = combine_where_clauses({
    base_where: where_sql,
    additional_condition: tag_conditions.sql
  })

  const query =
    build_entity_query({ where_clause: final_where, order_clause: order_sql }) +
    'LIMIT ? OFFSET ?'

  try {
    const results = await execute_duckdb_query({
      query,
      parameters: [...parameters, ...tag_conditions.parameters, limit, offset]
    })

    const entities_with_tags = results.map(transform_entity_result)
    log('Found %d entities', entities_with_tags.length)
    return entities_with_tags
  } catch (error) {
    log('Error querying entities: %s', error.message)
    throw error
  }
}

/**
 * Get a single entity by base_uri
 */
export async function get_entity_by_base_uri({ base_uri }) {
  log('Getting entity by base_uri: %s', base_uri)

  const query = build_entity_query({ where_clause: 'WHERE e.base_uri = ?' })

  try {
    const results = await execute_duckdb_query({
      query,
      parameters: [base_uri]
    })

    if (results.length === 0) {
      return null
    }

    return transform_entity_result(results[0])
  } catch (error) {
    log('Error getting entity by base_uri: %s', error.message)
    throw error
  }
}

/**
 * Get a single entity by entity_id
 */
export async function get_entity_by_id({ entity_id }) {
  log('Getting entity by entity_id: %s', entity_id)

  const query = build_entity_query({ where_clause: 'WHERE e.entity_id = ?' })

  try {
    const results = await execute_duckdb_query({
      query,
      parameters: [entity_id]
    })

    if (results.length === 0) {
      return null
    }

    return transform_entity_result(results[0])
  } catch (error) {
    log('Error getting entity by entity_id: %s', error.message)
    throw error
  }
}

/**
 * Count entities in unified entities table
 */
export async function count_entities_in_duckdb({ filters = [] }) {
  log('Counting entities in DuckDB')

  const { tag_conditions, regular_filters } = separate_and_build_tag_filters({
    filters,
    table_alias: 'e'
  })
  const { where_sql, parameters } = build_duckdb_where_clause({
    filters: regular_filters
  })
  const final_where = combine_where_clauses({
    base_where: where_sql,
    additional_condition: tag_conditions.sql
  })

  const query = `SELECT COUNT(*) as count FROM entities e ${final_where}`

  try {
    const results = await execute_duckdb_query({
      query,
      parameters: [...parameters, ...tag_conditions.parameters]
    })
    const count_value = results[0]?.count
    const count =
      typeof count_value === 'bigint' ? Number(count_value) : count_value || 0
    log('Entity count: %d', count)
    return count
  } catch (error) {
    log('Error counting entities: %s', error.message)
    throw error
  }
}
