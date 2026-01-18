/**
 * DuckDB Table Queries
 *
 * Query functions for tasks and threads with react-table filter/sort support.
 */

import debug from 'debug'
import { execute_duckdb_query } from './duckdb-database-client.mjs'

const log = debug('embedded-index:duckdb:queries')

/**
 * Task-specific columns stored in frontmatter JSON
 * Maps column names to DuckDB JSON extraction expressions
 * These columns are not indexed but can be filtered/sorted via JSON extraction
 *
 * Note: Parentheses are required around JSON extraction expressions due to
 * DuckDB operator precedence (-> and ->> have low precedence for lambda overlap)
 */
const TASK_FRONTMATTER_COLUMNS = {
  start_by: "(frontmatter->>'start_by')",
  finish_by: "(frontmatter->>'finish_by')",
  planned_start: "(frontmatter->>'planned_start')",
  planned_finish: "(frontmatter->>'planned_finish')",
  started_at: "(frontmatter->>'started_at')",
  finished_at: "(frontmatter->>'finished_at')",
  snooze_until: "(frontmatter->>'snooze_until')",
  estimated_total_duration:
    "CAST((frontmatter->>'estimated_total_duration') AS DOUBLE)"
}

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

export function build_duckdb_where_clause({
  filters,
  column_types = {},
  frontmatter_columns = {}
}) {
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

    // Resolve column reference - use JSON extraction if in frontmatter mapping
    const column_ref = frontmatter_columns[column_id] || column_id

    // Handle special operators that don't need values
    if (operator === 'IS NULL' || operator === 'IS NOT NULL') {
      conditions.push(`${column_ref} ${sql_operator}`)
      continue
    }

    if (operator === 'IS_EMPTY' || operator === 'IS_NOT_EMPTY') {
      conditions.push(`(${column_ref} IS NULL OR ${column_ref} ${sql_operator})`)
      continue
    }

    // Handle IN and NOT IN operators
    if (operator === 'IN' || operator === 'NOT IN') {
      if (Array.isArray(value) && value.length > 0) {
        const placeholders = value.map(() => '?').join(', ')
        conditions.push(`${column_ref} ${sql_operator} (${placeholders})`)
        parameters.push(...value)
      }
      continue
    }

    // Handle LIKE operators
    if (operator === 'LIKE' || operator === 'NOT LIKE') {
      conditions.push(`${column_ref} ${sql_operator} ?`)
      parameters.push(`%${value}%`)
      continue
    }

    // Handle standard comparison operators
    conditions.push(`${column_ref} ${sql_operator} ?`)
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

export function build_duckdb_order_clause({ sort, frontmatter_columns = {} }) {
  if (!sort || sort.length === 0) {
    return ''
  }

  const order_parts = sort.map(({ column_id, desc }) => {
    const direction = desc ? 'DESC' : 'ASC'

    // Use CASE expression for priority to ensure semantic ordering
    if (column_id === 'priority') {
      return `${PRIORITY_CASE_EXPRESSION} ${direction} NULLS LAST`
    }

    // Resolve column reference - use JSON extraction if in frontmatter mapping
    const column_ref = frontmatter_columns[column_id] || column_id

    return `${column_ref} ${direction} NULLS LAST`
  })

  return `ORDER BY ${order_parts.join(', ')}`
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

/**
 * Transform entity result from database format to API format
 * Parses tags_aggregated and frontmatter JSON
 */
function transform_entity_result(entity) {
  let frontmatter = entity.frontmatter
  if (typeof entity.frontmatter === 'string') {
    try {
      frontmatter = JSON.parse(entity.frontmatter)
    } catch (error) {
      log('Failed to parse frontmatter JSON for %s: %s', entity.base_uri, error.message)
      frontmatter = {}
    }
  }

  return {
    ...entity,
    tags: entity.tags_aggregated
      ? entity.tags_aggregated.split('||').filter(Boolean)
      : [],
    frontmatter
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

/**
 * Extract task from entity result
 * Parses frontmatter JSON and extracts task-specific fields into flat structure
 */
function extract_task_from_entity(entity) {
  let frontmatter = {}
  if (typeof entity.frontmatter === 'string') {
    try {
      frontmatter = JSON.parse(entity.frontmatter)
    } catch (error) {
      log('Failed to parse frontmatter JSON for %s: %s', entity.base_uri, error.message)
    }
  } else {
    frontmatter = entity.frontmatter || {}
  }

  return {
    // Core entity fields (already columns in entities table)
    entity_id: entity.entity_id,
    base_uri: entity.base_uri,
    title: entity.title,
    status: entity.status,
    priority: entity.priority,
    description: entity.description,
    created_at: entity.created_at,
    updated_at: entity.updated_at,
    archived: entity.archived,
    user_public_key: entity.user_public_key,

    // Task-specific fields from frontmatter
    start_by: frontmatter.start_by || null,
    finish_by: frontmatter.finish_by || null,
    planned_start: frontmatter.planned_start || null,
    planned_finish: frontmatter.planned_finish || null,
    started_at: frontmatter.started_at || null,
    finished_at: frontmatter.finished_at || null,
    snooze_until: frontmatter.snooze_until || null,
    estimated_total_duration: frontmatter.estimated_total_duration || null,

    // Tags from aggregation
    tags: entity.tags_aggregated
      ? entity.tags_aggregated.split('||').filter(Boolean)
      : []
  }
}

/**
 * Query tasks from entities table with type='task' filter
 * Wraps query_entities_from_duckdb with task-specific transformations
 */
export async function query_tasks_from_entities({
  filters = [],
  sort = [],
  limit = 1000,
  offset = 0
}) {
  log('Querying tasks from entities table')

  // Add type='task' filter
  const type_filter = { column_id: 'type', operator: '=', value: 'task' }
  const filters_with_type = [type_filter, ...filters]

  const { tag_conditions, regular_filters } = separate_and_build_tag_filters({
    filters: filters_with_type,
    table_alias: 'e'
  })
  const { where_sql, parameters } = build_duckdb_where_clause({
    filters: regular_filters,
    frontmatter_columns: TASK_FRONTMATTER_COLUMNS
  })
  const order_sql = build_duckdb_order_clause({
    sort,
    frontmatter_columns: TASK_FRONTMATTER_COLUMNS
  })
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

    const tasks = results.map(extract_task_from_entity)
    log('Found %d tasks from entities table', tasks.length)
    return tasks
  } catch (error) {
    log('Error querying tasks from entities: %s', error.message)
    throw error
  }
}

/**
 * Count tasks from entities table with type='task' filter
 */
export async function count_tasks_from_entities({ filters = [] }) {
  log('Counting tasks from entities table')

  // Add type='task' filter
  const type_filter = { column_id: 'type', operator: '=', value: 'task' }
  const filters_with_type = [type_filter, ...filters]

  const { tag_conditions, regular_filters } = separate_and_build_tag_filters({
    filters: filters_with_type,
    table_alias: 'e'
  })
  const { where_sql, parameters } = build_duckdb_where_clause({
    filters: regular_filters,
    frontmatter_columns: TASK_FRONTMATTER_COLUMNS
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
    log('Task count from entities: %d', count)
    return count
  } catch (error) {
    log('Error counting tasks from entities: %s', error.message)
    throw error
  }
}
