/**
 * DuckDB Table Queries
 *
 * Query functions for tasks and threads with react-table filter/sort support.
 */

import debug from 'debug'
import { execute_duckdb_query } from './duckdb-database-client.mjs'
import { derive_category_from_base_uri } from '../../physical-items/list-physical-items-from-filesystem.mjs'

const log = debug('embedded-index:duckdb:queries')

// Whitelist of valid column names for filter/sort operations
// Prevents SQL injection via column_id parameter
const VALID_COLUMNS = new Set([
  // Entity table columns
  'type',
  'status',
  'priority',
  'archived',
  'created_at',
  'updated_at',
  'user_public_key',
  'title',
  'description',
  'entity_id',
  'base_uri',
  'tags',
  'public_read',
  'visibility_analyzed_at',
  'archived_at',
  // Task frontmatter columns
  'start_by',
  'finish_by',
  'planned_start',
  'planned_finish',
  'started_at',
  'finished_at',
  'snooze_until',
  'estimated_total_duration',
  // Thread table columns
  'thread_id',
  'short_description',
  'thread_state',
  'message_count',
  'user_message_count',
  'assistant_message_count',
  'tool_call_count',
  'total_input_tokens',
  'total_output_tokens',
  'cache_creation_input_tokens',
  'cache_read_input_tokens',
  'total_tokens',
  'duration_ms',
  'duration_minutes',
  'working_directory',
  'working_directory_path',
  'source_provider',
  'inference_provider',
  'primary_model',
  'latest_event_timestamp',
  'latest_event_type',
  'file_references',
  'directory_references',
  'archived_at',
  'archive_reason',
  'external_session_id',
  // Physical item frontmatter columns
  'importance',
  'frequency_of_use',
  'exist',
  'consumable',
  'perishable',
  'current_quantity',
  'target_quantity',
  'manufacturer',
  'wattage',
  'voltage',
  'weight_ounces',
  'outlets_used',
  'ethernet_connected',
  'water_connection',
  'category'
])

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

/**
 * Physical item-specific columns stored in frontmatter JSON
 */
const PHYSICAL_ITEM_FRONTMATTER_COLUMNS = {
  // Derived: extract directory path between 'physical-item/' and the filename
  category:
    "REGEXP_REPLACE(REGEXP_REPLACE(base_uri, '^[^:]+:physical-item/', ''), '/[^/]+$', '')",
  importance: "(frontmatter->>'importance')",
  frequency_of_use: "(frontmatter->>'frequency_of_use')",
  exist: "CAST((frontmatter->>'exist') AS BOOLEAN)",
  consumable: "CAST((frontmatter->>'consumable') AS BOOLEAN)",
  perishable: "CAST((frontmatter->>'perishable') AS BOOLEAN)",
  current_quantity:
    "CAST((frontmatter->>'current_quantity') AS DOUBLE)",
  target_quantity:
    "CAST((frontmatter->>'target_quantity') AS DOUBLE)",
  manufacturer: "(frontmatter->>'manufacturer')",
  wattage: "CAST((frontmatter->>'wattage') AS DOUBLE)",
  voltage: "CAST((frontmatter->>'voltage') AS DOUBLE)",
  weight_ounces: "CAST((frontmatter->>'weight_ounces') AS DOUBLE)",
  outlets_used: "CAST((frontmatter->>'outlets_used') AS DOUBLE)",
  ethernet_connected:
    "CAST((frontmatter->>'ethernet_connected') AS BOOLEAN)",
  water_connection:
    "CAST((frontmatter->>'water_connection') AS BOOLEAN)"
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
  IS_NOT_EMPTY: "!= ''",
  IS_NULL_OR_IN_PAST: 'IS_NULL_OR_IN_PAST'
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

    // Validate column_id against whitelist to prevent SQL injection
    if (!VALID_COLUMNS.has(column_id)) {
      log('Rejected invalid column_id in filter: %s', column_id)
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
      conditions.push(
        `(${column_ref} IS NULL OR ${column_ref} ${sql_operator})`
      )
      continue
    }

    if (operator === 'IS_NULL_OR_IN_PAST') {
      conditions.push(
        `(${column_ref} IS NULL OR TRY_CAST(${column_ref} AS TIMESTAMPTZ) <= CURRENT_TIMESTAMP)`
      )
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

const IMPORTANCE_CASE_EXPRESSION = `
  CASE (frontmatter->>'importance')
    WHEN 'Core' THEN 3
    WHEN 'Standard' THEN 2
    WHEN 'Premium' THEN 1
    WHEN 'Potential' THEN 0
    ELSE 0
  END`

const FREQUENCY_CASE_EXPRESSION = `
  CASE (frontmatter->>'frequency_of_use')
    WHEN 'Daily' THEN 2
    WHEN 'Weekly' THEN 1
    WHEN 'Infrequent' THEN 0
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

  const order_parts = sort
    .filter(({ column_id }) => {
      // Validate column_id against whitelist to prevent SQL injection
      if (!VALID_COLUMNS.has(column_id)) {
        log('Rejected invalid column_id in sort: %s', column_id)
        return false
      }
      return true
    })
    .map(({ column_id, desc }) => {
      const direction = desc ? 'DESC' : 'ASC'

      // Use CASE expressions for semantic ordering of priority/importance/frequency
      if (column_id === 'priority') {
        return `${PRIORITY_CASE_EXPRESSION} ${direction} NULLS LAST`
      }
      if (column_id === 'importance') {
        return `${IMPORTANCE_CASE_EXPRESSION} ${direction} NULLS LAST`
      }
      if (column_id === 'frequency_of_use') {
        return `${FREQUENCY_CASE_EXPRESSION} ${direction} NULLS LAST`
      }

      // Resolve column reference - use JSON extraction if in frontmatter mapping
      const column_ref = frontmatter_columns[column_id] || column_id

      return `${column_ref} ${direction} NULLS LAST`
    })

  return `ORDER BY ${order_parts.join(', ')}`
}

/**
 * Escape SQL LIKE metacharacters (% and _) in a string
 * @param {string} str - String to escape
 * @returns {string} Escaped string safe for LIKE patterns
 */
function escape_like_metacharacters(str) {
  return str.replace(/[%_\\]/g, '\\$&')
}

/**
 * Build thread tag filter conditions
 * Returns tag conditions SQL/parameters for filtering threads by tag
 *
 * @param {Object} params - Parameters
 * @param {Array} params.tags - Array of tag_base_uri values to filter by
 * @returns {Object} Object with sql and parameters
 */
function build_thread_tag_conditions({ tags }) {
  if (!tags || tags.length === 0) {
    return { sql: '', parameters: [] }
  }

  // Filter threads that have at least one of the specified tags
  const placeholders = tags.map(() => '?').join(', ')
  const sql = `EXISTS (SELECT 1 FROM thread_tags tt_filter WHERE tt_filter.thread_id = threads.thread_id AND tt_filter.tag_base_uri IN (${placeholders}))`

  return { sql, parameters: [...tags] }
}

/**
 * Build additional thread-specific WHERE conditions for search and reference filters
 * @param {Object} params - Parameters
 * @param {string} [params.search] - Text search for title and short_description
 * @param {string} [params.file_ref] - Pattern to match in file_references JSON array (supports glob: * and ?)
 * @param {string} [params.dir_ref] - Pattern to match in directory_references JSON array (supports glob: * and ?)
 * @returns {Object} Object with conditions array and parameters array
 */
function build_thread_search_conditions({ search, file_ref, dir_ref }) {
  const conditions = []
  const parameters = []

  // Text search on title and short_description (case-insensitive)
  // Escape LIKE metacharacters so user input is treated as literal text
  if (search) {
    conditions.push('(title ILIKE ? OR short_description ILIKE ?)')
    const escaped_search = escape_like_metacharacters(search)
    const search_pattern = `%${escaped_search}%`
    parameters.push(search_pattern, search_pattern)
  }

  // File reference pattern matching
  // Escape existing LIKE metacharacters, then convert glob wildcards to SQL LIKE
  if (file_ref) {
    const escaped = escape_like_metacharacters(file_ref)
    const like_pattern = escaped.replace(/\*/g, '%').replace(/\?/g, '_')
    conditions.push('file_references LIKE ?')
    parameters.push(`%${like_pattern}%`)
  }

  // Directory reference pattern matching
  if (dir_ref) {
    const escaped = escape_like_metacharacters(dir_ref)
    const like_pattern = escaped.replace(/\*/g, '%').replace(/\?/g, '_')
    conditions.push('directory_references LIKE ?')
    parameters.push(`%${like_pattern}%`)
  }

  return { conditions, parameters }
}

export async function query_threads_from_duckdb({
  filters = [],
  sort = [],
  limit = 1000,
  offset = 0,
  search,
  file_ref,
  dir_ref,
  tags
}) {
  log('Querying threads from DuckDB')

  const { where_sql, parameters } = build_duckdb_where_clause({ filters })
  const order_sql = build_duckdb_order_clause({ sort })

  // Build additional search conditions
  const search_conditions = build_thread_search_conditions({
    search,
    file_ref,
    dir_ref
  })

  // Build tag filter conditions
  const tag_conditions = build_thread_tag_conditions({ tags })

  // Combine WHERE clauses
  let final_where = where_sql
  if (search_conditions.conditions.length > 0) {
    const additional = search_conditions.conditions.join(' AND ')
    final_where = combine_where_clauses({
      base_where: final_where,
      additional_condition: additional
    })
  }
  if (tag_conditions.sql) {
    final_where = combine_where_clauses({
      base_where: final_where,
      additional_condition: tag_conditions.sql
    })
  }

  const query = `
    SELECT
      thread_id, title, short_description, thread_state, created_at, updated_at,
      message_count, user_message_count, assistant_message_count, tool_call_count,
      total_input_tokens, total_output_tokens, cache_creation_input_tokens,
      cache_read_input_tokens, total_tokens, duration_ms, duration_minutes,
      working_directory, working_directory_path, source_provider,
      inference_provider, primary_model, user_public_key,
      latest_event_timestamp, latest_event_type, latest_event_data,
      file_references, directory_references, archived_at, archive_reason,
      external_session_id
    FROM threads
    ${final_where}
    ${order_sql}
    LIMIT ? OFFSET ?
  `

  try {
    const results = await execute_duckdb_query({
      query,
      parameters: [
        ...parameters,
        ...search_conditions.parameters,
        ...tag_conditions.parameters,
        limit,
        offset
      ]
    })

    log('Found %d threads', results.length)
    return results
  } catch (error) {
    log('Error querying threads: %s', error.message)
    throw error
  }
}

export async function count_threads_in_duckdb({
  filters = [],
  search,
  file_ref,
  dir_ref,
  tags
}) {
  log('Counting threads in DuckDB')

  const { where_sql, parameters } = build_duckdb_where_clause({ filters })

  // Build additional search conditions
  const search_conditions = build_thread_search_conditions({
    search,
    file_ref,
    dir_ref
  })

  // Build tag filter conditions
  const tag_conditions = build_thread_tag_conditions({ tags })

  // Combine WHERE clauses
  let final_where = where_sql
  if (search_conditions.conditions.length > 0) {
    const additional = search_conditions.conditions.join(' AND ')
    final_where = combine_where_clauses({
      base_where: final_where,
      additional_condition: additional
    })
  }
  if (tag_conditions.sql) {
    final_where = combine_where_clauses({
      base_where: final_where,
      additional_condition: tag_conditions.sql
    })
  }

  const query = `SELECT COUNT(*) as count FROM threads ${final_where}`

  try {
    const results = await execute_duckdb_query({
      query,
      parameters: [
        ...parameters,
        ...search_conditions.parameters,
        ...tag_conditions.parameters
      ]
    })
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
      log(
        'Failed to parse frontmatter JSON for %s: %s',
        entity.base_uri,
        error.message
      )
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
  offset = 0,
  search
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

  // Build search conditions for title and description (case-insensitive)
  const search_params = []
  let search_condition = null
  if (search) {
    const escaped_search = escape_like_metacharacters(search)
    const search_pattern = `%${escaped_search}%`
    search_condition = '(e.title ILIKE ? OR e.description ILIKE ?)'
    search_params.push(search_pattern, search_pattern)
  }

  let final_where = where_sql
  if (search_condition) {
    final_where = combine_where_clauses({
      base_where: final_where,
      additional_condition: search_condition
    })
  }
  final_where = combine_where_clauses({
    base_where: final_where,
    additional_condition: tag_conditions.sql
  })

  // When search is provided and no explicit sort, order by relevance:
  // title matches first, then description-only matches, then by updated_at
  let final_order = order_sql
  const relevance_params = []
  if (search && sort.length === 0) {
    final_order =
      'ORDER BY CASE WHEN e.title ILIKE ? THEN 0 ELSE 1 END, e.updated_at DESC'
    relevance_params.push(search_params[0])
  }

  const query =
    build_entity_query({
      where_clause: final_where,
      order_clause: final_order
    }) + 'LIMIT ? OFFSET ?'

  try {
    const results = await execute_duckdb_query({
      query,
      parameters: [
        ...parameters,
        ...search_params,
        ...tag_conditions.parameters,
        ...relevance_params,
        limit,
        offset
      ]
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
export async function count_entities_in_duckdb({ filters = [], search }) {
  log('Counting entities in DuckDB')

  const { tag_conditions, regular_filters } = separate_and_build_tag_filters({
    filters,
    table_alias: 'e'
  })
  const { where_sql, parameters } = build_duckdb_where_clause({
    filters: regular_filters
  })

  const search_params = []
  let search_condition = null
  if (search) {
    const escaped_search = escape_like_metacharacters(search)
    const search_pattern = `%${escaped_search}%`
    search_condition = '(e.title ILIKE ? OR e.description ILIKE ?)'
    search_params.push(search_pattern, search_pattern)
  }

  let final_where = where_sql
  if (search_condition) {
    final_where = combine_where_clauses({
      base_where: final_where,
      additional_condition: search_condition
    })
  }
  final_where = combine_where_clauses({
    base_where: final_where,
    additional_condition: tag_conditions.sql
  })

  const query = `SELECT COUNT(*) as count FROM entities e ${final_where}`

  try {
    const results = await execute_duckdb_query({
      query,
      parameters: [
        ...parameters,
        ...search_params,
        ...tag_conditions.parameters
      ]
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
      log(
        'Failed to parse frontmatter JSON for %s: %s',
        entity.base_uri,
        error.message
      )
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

/**
 * Query distinct tag base_uris that are used by a specific entity type or by threads.
 * Returns a Set of tag_base_uri strings for efficient lookup/filtering.
 *
 * @param {Object} params - Parameters
 * @param {string} params.used_by - 'task' (or other entity type) to query entity_tags filtered by type, or 'thread' to query thread_tags
 * @returns {Promise<Set<string>>} Set of tag_base_uri values
 */
export async function query_tags_used_by({ used_by } = {}) {
  if (!used_by) {
    throw new Error('used_by parameter is required')
  }

  log('Querying tags used by %s from DuckDB', used_by)

  let query
  const parameters = []

  if (used_by === 'thread') {
    query = `SELECT DISTINCT tag_base_uri FROM thread_tags`
  } else {
    query = `
      SELECT DISTINCT et.tag_base_uri
      FROM entity_tags et
      JOIN entities e ON e.base_uri = et.entity_base_uri
      WHERE e.type = $1
    `
    parameters.push(used_by)
  }

  try {
    const results = await execute_duckdb_query({ query, parameters })
    const tag_set = new Set(results.map((row) => row.tag_base_uri))
    log('Found %d tags used by %s', tag_set.size, used_by)
    return tag_set
  } catch (error) {
    log('Error querying tags used by %s: %s', used_by, error.message)
    throw error
  }
}

/**
 * Query tag statistics - entity counts per tag
 * Returns all tags with their usage counts, sorted by count descending
 *
 * @param {Object} params - Parameters
 * @param {boolean} [params.include_zero_count=false] - Include tags with no entities
 * @returns {Promise<Array<{tag_base_uri: string, title: string, entity_count: number}>>}
 */
export async function query_tag_statistics_from_duckdb({
  include_zero_count = false
} = {}) {
  log('Querying tag statistics from DuckDB')

  // Join with entities table to get tag titles
  // LEFT JOIN entity_tags to include tags with zero usage when requested
  const query = include_zero_count
    ? `
      SELECT
        t.base_uri AS tag_base_uri,
        t.title,
        COUNT(et.entity_base_uri) AS entity_count
      FROM entities t
      LEFT JOIN entity_tags et ON et.tag_base_uri = t.base_uri
      WHERE t.type = 'tag' AND (t.archived = false OR t.archived IS NULL)
      GROUP BY t.base_uri, t.title
      ORDER BY entity_count DESC, t.title ASC
    `
    : `
      SELECT
        et.tag_base_uri,
        t.title,
        COUNT(*) AS entity_count
      FROM entity_tags et
      LEFT JOIN entities t ON t.base_uri = et.tag_base_uri
      GROUP BY et.tag_base_uri, t.title
      ORDER BY entity_count DESC, t.title ASC
    `

  try {
    const results = await execute_duckdb_query({ query, parameters: [] })

    const stats = results.map((row) => ({
      tag_base_uri: row.tag_base_uri,
      title: row.title || row.tag_base_uri,
      entity_count:
        typeof row.entity_count === 'bigint'
          ? Number(row.entity_count)
          : row.entity_count || 0
    }))

    log('Found statistics for %d tags', stats.length)
    return stats
  } catch (error) {
    log('Error querying tag statistics: %s', error.message)
    throw error
  }
}

/**
 * Extract physical item from entity result
 * Parses frontmatter JSON and extracts physical item-specific fields
 */
function extract_physical_item_from_entity(entity) {
  let frontmatter = {}
  if (typeof entity.frontmatter === 'string') {
    try {
      frontmatter = JSON.parse(entity.frontmatter)
    } catch (error) {
      log(
        'Failed to parse frontmatter JSON for %s: %s',
        entity.base_uri,
        error.message
      )
    }
  } else {
    frontmatter = entity.frontmatter || {}
  }

  // Derive category from base_uri path
  const category = derive_category_from_base_uri(entity.base_uri || '')

  return {
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

    // Physical item-specific fields from frontmatter
    category,
    importance: frontmatter.importance || null,
    frequency_of_use: frontmatter.frequency_of_use || null,
    exist: frontmatter.exist ?? null,
    consumable: frontmatter.consumable ?? null,
    perishable: frontmatter.perishable ?? null,
    current_quantity: frontmatter.current_quantity ?? null,
    target_quantity: frontmatter.target_quantity ?? null,
    manufacturer: frontmatter.manufacturer || null,
    wattage: frontmatter.wattage ?? null,
    voltage: frontmatter.voltage ?? null,
    weight_ounces: frontmatter.weight_ounces ?? null,
    outlets_used: frontmatter.outlets_used ?? null,
    ethernet_connected: frontmatter.ethernet_connected ?? null,
    water_connection: frontmatter.water_connection ?? null,

    tags: entity.tags_aggregated
      ? entity.tags_aggregated.split('||').filter(Boolean)
      : []
  }
}

/**
 * Query physical items from entities table with type='physical_item' filter
 */
export async function query_physical_items_from_entities({
  filters = [],
  sort = [],
  limit = 1000,
  offset = 0
}) {
  log('Querying physical items from entities table')

  const type_filter = {
    column_id: 'type',
    operator: '=',
    value: 'physical_item'
  }
  const filters_with_type = [type_filter, ...filters]

  const { tag_conditions, regular_filters } = separate_and_build_tag_filters({
    filters: filters_with_type,
    table_alias: 'e'
  })
  const { where_sql, parameters } = build_duckdb_where_clause({
    filters: regular_filters,
    frontmatter_columns: PHYSICAL_ITEM_FRONTMATTER_COLUMNS
  })
  const order_sql = build_duckdb_order_clause({
    sort,
    frontmatter_columns: PHYSICAL_ITEM_FRONTMATTER_COLUMNS
  })
  const final_where = combine_where_clauses({
    base_where: where_sql,
    additional_condition: tag_conditions.sql
  })

  const query =
    build_entity_query({
      where_clause: final_where,
      order_clause: order_sql
    }) + 'LIMIT ? OFFSET ?'

  try {
    const results = await execute_duckdb_query({
      query,
      parameters: [...parameters, ...tag_conditions.parameters, limit, offset]
    })

    const items = results.map(extract_physical_item_from_entity)
    log('Found %d physical items from entities table', items.length)
    return items
  } catch (error) {
    log('Error querying physical items from entities: %s', error.message)
    throw error
  }
}

/**
 * Count physical items from entities table with type='physical_item' filter
 */
export async function count_physical_items_from_entities({ filters = [] }) {
  log('Counting physical items from entities table')

  const type_filter = {
    column_id: 'type',
    operator: '=',
    value: 'physical_item'
  }
  const filters_with_type = [type_filter, ...filters]

  const { tag_conditions, regular_filters } = separate_and_build_tag_filters({
    filters: filters_with_type,
    table_alias: 'e'
  })
  const { where_sql, parameters } = build_duckdb_where_clause({
    filters: regular_filters,
    frontmatter_columns: PHYSICAL_ITEM_FRONTMATTER_COLUMNS
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
    log('Physical item count from entities: %d', count)
    return count
  } catch (error) {
    log('Error counting physical items from entities: %s', error.message)
    throw error
  }
}
