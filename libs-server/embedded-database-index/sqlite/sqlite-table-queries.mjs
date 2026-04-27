/**
 * SQLite Table Queries
 *
 * Query functions for entities and threads with react-table filter/sort support.
 */

import debug from 'debug'
import { execute_sqlite_query } from './sqlite-database-client.mjs'
import { derive_category_from_base_uri } from '#libs-server/physical-items/list-physical-items-from-filesystem.mjs'

const log = debug('embedded-index:sqlite:queries')

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
  'context_input_tokens',
  'context_cache_creation_input_tokens',
  'context_cache_read_input_tokens',
  'cumulative_input_tokens',
  'cumulative_output_tokens',
  'cumulative_cache_creation_input_tokens',
  'cumulative_cache_read_input_tokens',
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
  'category',
  'misc_notes'
])

/**
 * Task-specific columns stored in frontmatter JSON
 * Uses json_extract() for frontmatter field access
 */
const TASK_FRONTMATTER_COLUMNS = {
  start_by: "json_extract(frontmatter, '$.start_by')",
  finish_by: "json_extract(frontmatter, '$.finish_by')",
  planned_start: "json_extract(frontmatter, '$.planned_start')",
  planned_finish: "json_extract(frontmatter, '$.planned_finish')",
  started_at: "json_extract(frontmatter, '$.started_at')",
  finished_at: "json_extract(frontmatter, '$.finished_at')",
  snooze_until: "json_extract(frontmatter, '$.snooze_until')",
  estimated_total_duration:
    "CAST(json_extract(frontmatter, '$.estimated_total_duration') AS REAL)"
}

/**
 * Physical item-specific columns stored in frontmatter JSON
 */
const PHYSICAL_ITEM_FRONTMATTER_COLUMNS = {
  // Category derived in JS via derive_category_from_base_uri (no REGEXP_REPLACE in SQLite)
  category: 'base_uri',
  importance: "json_extract(frontmatter, '$.importance')",
  frequency_of_use: "json_extract(frontmatter, '$.frequency_of_use')",
  exist: "json_extract(frontmatter, '$.exist')",
  consumable: "json_extract(frontmatter, '$.consumable')",
  perishable: "json_extract(frontmatter, '$.perishable')",
  current_quantity:
    "CAST(json_extract(frontmatter, '$.current_quantity') AS REAL)",
  target_quantity:
    "CAST(json_extract(frontmatter, '$.target_quantity') AS REAL)",
  manufacturer: "json_extract(frontmatter, '$.manufacturer')",
  wattage: "CAST(json_extract(frontmatter, '$.wattage') AS REAL)",
  voltage: "CAST(json_extract(frontmatter, '$.voltage') AS REAL)",
  weight_ounces: "CAST(json_extract(frontmatter, '$.weight_ounces') AS REAL)",
  outlets_used: "CAST(json_extract(frontmatter, '$.outlets_used') AS REAL)",
  ethernet_connected: "json_extract(frontmatter, '$.ethernet_connected')",
  water_connection: "json_extract(frontmatter, '$.water_connection')",
  misc_notes: "json_extract(frontmatter, '$.misc_notes')"
}

// Map client filter operators to SQL operators
// SQLite uses LIKE for case-insensitive matching (ASCII default behavior)
const FILTER_OPERATOR_MAP = {
  '=': '=',
  '!=': '!=',
  '>': '>',
  '>=': '>=',
  '<': '<',
  '<=': '<=',
  LIKE: 'LIKE',
  'NOT LIKE': 'NOT LIKE',
  // SQLite LIKE is case-insensitive for ASCII by default
  ILIKE: 'LIKE',
  'NOT ILIKE': 'NOT LIKE',
  IN: 'IN',
  'NOT IN': 'NOT IN',
  'IS NULL': 'IS NULL',
  'IS NOT NULL': 'IS NOT NULL',
  IS_EMPTY: "= ''",
  IS_NOT_EMPTY: "!= ''",
  IS_NULL_OR_IN_PAST: 'IS_NULL_OR_IN_PAST'
}

export function build_sqlite_where_clause({
  filters,
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

    if (!VALID_COLUMNS.has(column_id)) {
      log('Rejected invalid column_id in filter: %s', column_id)
      continue
    }

    const sql_operator = FILTER_OPERATOR_MAP[operator]
    if (!sql_operator) {
      log('Unknown filter operator: %s', operator)
      continue
    }

    const column_ref = frontmatter_columns[column_id] || column_id

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
      // SQLite: compare ISO timestamps directly as text (lexicographic)
      conditions.push(
        `(${column_ref} IS NULL OR ${column_ref} <= datetime('now'))`
      )
      continue
    }

    if (operator === 'IN' || operator === 'NOT IN') {
      if (Array.isArray(value) && value.length > 0) {
        const placeholders = value.map(() => '?').join(', ')
        conditions.push(`${column_ref} ${sql_operator} (${placeholders})`)
        parameters.push(...value)
      }
      continue
    }

    if (
      operator === 'LIKE' ||
      operator === 'NOT LIKE' ||
      operator === 'ILIKE' ||
      operator === 'NOT ILIKE'
    ) {
      conditions.push(`${column_ref} ${sql_operator} ?`)
      parameters.push(`%${value}%`)
      continue
    }

    conditions.push(`${column_ref} ${sql_operator} ?`)
    parameters.push(value)
  }

  const where_sql =
    conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  return { where_sql, parameters }
}

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
  CASE json_extract(frontmatter, '$.importance')
    WHEN 'Core' THEN 3
    WHEN 'Standard' THEN 2
    WHEN 'Premium' THEN 1
    WHEN 'Potential' THEN 0
    ELSE 0
  END`

const FREQUENCY_CASE_EXPRESSION = `
  CASE json_extract(frontmatter, '$.frequency_of_use')
    WHEN 'Daily' THEN 2
    WHEN 'Weekly' THEN 1
    WHEN 'Infrequent' THEN 0
    ELSE 0
  END`

function combine_where_clauses({ base_where, additional_condition }) {
  if (!additional_condition) return base_where
  if (base_where) return `${base_where} AND ${additional_condition}`
  return `WHERE ${additional_condition}`
}

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
      const placeholders = value.map(() => '?').join(', ')
      conditions.push(
        `NOT EXISTS (SELECT 1 FROM entity_tags et_filter WHERE et_filter.entity_base_uri = ${table_alias}.base_uri AND et_filter.tag_base_uri IN (${placeholders}))`
      )
      parameters.push(...value)
    } else if (operator === 'IS_EMPTY') {
      conditions.push(
        `NOT EXISTS (SELECT 1 FROM entity_tags et_filter WHERE et_filter.entity_base_uri = ${table_alias}.base_uri)`
      )
    } else if (operator === 'IS_NOT_EMPTY') {
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

export function build_sqlite_order_clause({ sort, frontmatter_columns = {} }) {
  if (!sort || sort.length === 0) {
    return ''
  }

  const order_parts = sort
    .filter(({ column_id }) => {
      if (!VALID_COLUMNS.has(column_id)) {
        log('Rejected invalid column_id in sort: %s', column_id)
        return false
      }
      return true
    })
    .map(({ column_id, desc }) => {
      const direction = desc ? 'DESC' : 'ASC'

      if (column_id === 'priority') {
        return `${PRIORITY_CASE_EXPRESSION} ${direction}`
      }
      if (column_id === 'importance') {
        return `${IMPORTANCE_CASE_EXPRESSION} ${direction}`
      }
      if (column_id === 'frequency_of_use') {
        return `${FREQUENCY_CASE_EXPRESSION} ${direction}`
      }

      const column_ref = frontmatter_columns[column_id] || column_id

      // SQLite: NULLS LAST is supported since 3.30.0
      return `${column_ref} ${direction} NULLS LAST`
    })

  return `ORDER BY ${order_parts.join(', ')}`
}

function escape_like_metacharacters(str) {
  return str.replace(/[%_\\]/g, '\\$&')
}

function build_thread_tag_conditions({ tags, without_tags }) {
  if (without_tags) {
    return {
      sql: 'NOT EXISTS (SELECT 1 FROM thread_tags tt_filter WHERE tt_filter.thread_id = threads.thread_id)',
      parameters: []
    }
  }

  if (!tags || tags.length === 0) {
    return { sql: '', parameters: [] }
  }

  const placeholders = tags.map(() => '?').join(', ')
  const sql = `EXISTS (SELECT 1 FROM thread_tags tt_filter WHERE tt_filter.thread_id = threads.thread_id AND tt_filter.tag_base_uri IN (${placeholders}))`

  return { sql, parameters: [...tags] }
}

function build_thread_search_conditions({ search, file_ref, dir_ref }) {
  const conditions = []
  const parameters = []

  // SQLite LIKE is case-insensitive for ASCII letters by default
  if (search) {
    conditions.push('(title LIKE ? OR short_description LIKE ?)')
    const escaped_search = escape_like_metacharacters(search)
    const search_pattern = `%${escaped_search}%`
    parameters.push(search_pattern, search_pattern)
  }

  if (file_ref) {
    const escaped = escape_like_metacharacters(file_ref)
    const like_pattern = escaped.replace(/\*/g, '%').replace(/\?/g, '_')
    conditions.push('file_references LIKE ?')
    parameters.push(`%${like_pattern}%`)
  }

  if (dir_ref) {
    const escaped = escape_like_metacharacters(dir_ref)
    const like_pattern = escaped.replace(/\*/g, '%').replace(/\?/g, '_')
    conditions.push('directory_references LIKE ?')
    parameters.push(`%${like_pattern}%`)
  }

  return { conditions, parameters }
}

export async function query_threads_from_sqlite({
  filters = [],
  sort = [],
  limit = 1000,
  offset = 0,
  search,
  file_ref,
  dir_ref,
  tags,
  without_tags
}) {
  log('Querying threads from SQLite')

  const { where_sql, parameters } = build_sqlite_where_clause({
    filters,
    frontmatter_columns: { thread_id: 'threads.thread_id' }
  })
  const order_sql = build_sqlite_order_clause({ sort })

  const search_conditions = build_thread_search_conditions({
    search,
    file_ref,
    dir_ref
  })

  const tag_conditions = build_thread_tag_conditions({ tags, without_tags })

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
      threads.thread_id, threads.title, threads.short_description,
      threads.thread_state, threads.created_at, threads.updated_at,
      threads.message_count, threads.user_message_count,
      threads.assistant_message_count, threads.tool_call_count,
      threads.context_input_tokens, threads.context_cache_creation_input_tokens,
      threads.context_cache_read_input_tokens,
      threads.cumulative_input_tokens, threads.cumulative_output_tokens,
      threads.cumulative_cache_creation_input_tokens, threads.cumulative_cache_read_input_tokens,
      threads.total_tokens, threads.duration_ms, threads.duration_minutes,
      threads.working_directory, threads.working_directory_path,
      threads.source_provider, threads.inference_provider,
      threads.primary_model, threads.user_public_key,
      threads.latest_event_timestamp, threads.latest_event_type,
      threads.latest_event_data, threads.file_references,
      threads.directory_references, threads.archived_at,
      threads.archive_reason, threads.external_session_id,
      GROUP_CONCAT(tt.tag_base_uri, '||') AS tags_aggregated
    FROM threads
    LEFT JOIN thread_tags tt ON tt.thread_id = threads.thread_id
    ${final_where}
    GROUP BY threads.thread_id
    ${order_sql}
    LIMIT ? OFFSET ?
  `

  try {
    const results = await execute_sqlite_query({
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

export async function count_threads_in_sqlite({
  filters = [],
  search,
  file_ref,
  dir_ref,
  tags,
  without_tags
}) {
  log('Counting threads in SQLite')

  const { where_sql, parameters } = build_sqlite_where_clause({ filters })

  const search_conditions = build_thread_search_conditions({
    search,
    file_ref,
    dir_ref
  })

  const tag_conditions = build_thread_tag_conditions({ tags, without_tags })

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
    const results = await execute_sqlite_query({
      query,
      parameters: [
        ...parameters,
        ...search_conditions.parameters,
        ...tag_conditions.parameters
      ]
    })
    const count = Number(results[0]?.count) || 0
    log('Thread count: %d', count)
    return count
  } catch (error) {
    log('Error counting threads: %s', error.message)
    throw error
  }
}

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

function build_entity_query({ where_clause = '', order_clause = '' }) {
  return `
    SELECT
      e.base_uri, e.entity_id, e.type, e.title, e.description,
      e.status, e.priority, e.archived, e.user_public_key,
      e.created_at, e.updated_at, e.archived_at, e.frontmatter,
      GROUP_CONCAT(et.tag_base_uri, '||') AS tags_aggregated
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

export async function query_entities_from_sqlite({
  filters = [],
  sort = [],
  limit = 1000,
  offset = 0,
  search
}) {
  log('Querying entities from SQLite')

  const { tag_conditions, regular_filters } = separate_and_build_tag_filters({
    filters,
    table_alias: 'e'
  })
  const { where_sql, parameters } = build_sqlite_where_clause({
    filters: regular_filters
  })
  const order_sql = build_sqlite_order_clause({ sort })

  const search_params = []
  let search_condition = null
  if (search) {
    const escaped_search = escape_like_metacharacters(search)
    const search_pattern = `%${escaped_search}%`
    search_condition = '(e.title LIKE ? OR e.description LIKE ?)'
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

  let final_order = order_sql
  const relevance_params = []
  if (search && sort.length === 0) {
    final_order =
      'ORDER BY CASE WHEN e.title LIKE ? THEN 0 ELSE 1 END, e.updated_at DESC'
    relevance_params.push(search_params[0])
  }

  const query =
    build_entity_query({
      where_clause: final_where,
      order_clause: final_order
    }) + 'LIMIT ? OFFSET ?'

  try {
    const results = await execute_sqlite_query({
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

export async function get_entity_by_base_uri({ base_uri }) {
  log('Getting entity by base_uri: %s', base_uri)

  const query = build_entity_query({ where_clause: 'WHERE e.base_uri = ?' })

  try {
    const results = await execute_sqlite_query({
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

export async function get_entity_by_id({ entity_id }) {
  log('Getting entity by entity_id: %s', entity_id)

  const query = build_entity_query({ where_clause: 'WHERE e.entity_id = ?' })

  try {
    const results = await execute_sqlite_query({
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

export async function count_entities_in_sqlite({ filters = [], search }) {
  log('Counting entities in SQLite')

  const { tag_conditions, regular_filters } = separate_and_build_tag_filters({
    filters,
    table_alias: 'e'
  })
  const { where_sql, parameters } = build_sqlite_where_clause({
    filters: regular_filters
  })

  const search_params = []
  let search_condition = null
  if (search) {
    const escaped_search = escape_like_metacharacters(search)
    const search_pattern = `%${escaped_search}%`
    search_condition = '(e.title LIKE ? OR e.description LIKE ?)'
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
    const results = await execute_sqlite_query({
      query,
      parameters: [
        ...parameters,
        ...search_params,
        ...tag_conditions.parameters
      ]
    })
    const count = Number(results[0]?.count) || 0
    log('Entity count: %d', count)
    return count
  } catch (error) {
    log('Error counting entities: %s', error.message)
    throw error
  }
}

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

    start_by: frontmatter.start_by || null,
    finish_by: frontmatter.finish_by || null,
    planned_start: frontmatter.planned_start || null,
    planned_finish: frontmatter.planned_finish || null,
    started_at: frontmatter.started_at || null,
    finished_at: frontmatter.finished_at || null,
    snooze_until: frontmatter.snooze_until || null,
    estimated_total_duration: frontmatter.estimated_total_duration || null,

    tags: entity.tags_aggregated
      ? entity.tags_aggregated.split('||').filter(Boolean)
      : []
  }
}

export async function query_tasks_from_entities({
  filters = [],
  sort = [],
  limit = 1000,
  offset = 0
}) {
  log('Querying tasks from entities table')

  const type_filter = { column_id: 'type', operator: '=', value: 'task' }
  const filters_with_type = [type_filter, ...filters]

  const { tag_conditions, regular_filters } = separate_and_build_tag_filters({
    filters: filters_with_type,
    table_alias: 'e'
  })
  const { where_sql, parameters } = build_sqlite_where_clause({
    filters: regular_filters,
    frontmatter_columns: TASK_FRONTMATTER_COLUMNS
  })
  const order_sql = build_sqlite_order_clause({
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
    const results = await execute_sqlite_query({
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

export async function count_tasks_from_entities({ filters = [] }) {
  log('Counting tasks from entities table')

  const type_filter = { column_id: 'type', operator: '=', value: 'task' }
  const filters_with_type = [type_filter, ...filters]

  const { tag_conditions, regular_filters } = separate_and_build_tag_filters({
    filters: filters_with_type,
    table_alias: 'e'
  })
  const { where_sql, parameters } = build_sqlite_where_clause({
    filters: regular_filters,
    frontmatter_columns: TASK_FRONTMATTER_COLUMNS
  })
  const final_where = combine_where_clauses({
    base_where: where_sql,
    additional_condition: tag_conditions.sql
  })

  const query = `SELECT COUNT(*) as count FROM entities e ${final_where}`

  try {
    const results = await execute_sqlite_query({
      query,
      parameters: [...parameters, ...tag_conditions.parameters]
    })
    const count = Number(results[0]?.count) || 0
    log('Task count from entities: %d', count)
    return count
  } catch (error) {
    log('Error counting tasks from entities: %s', error.message)
    throw error
  }
}

export async function query_tags_used_by({ used_by } = {}) {
  if (!used_by) {
    throw new Error('used_by parameter is required')
  }

  log('Querying tags used by %s from SQLite', used_by)

  let query
  const parameters = []

  if (used_by === 'thread') {
    query = `SELECT DISTINCT tag_base_uri FROM thread_tags`
  } else {
    query = `
      SELECT DISTINCT et.tag_base_uri
      FROM entity_tags et
      JOIN entities e ON e.base_uri = et.entity_base_uri
      WHERE e.type = ?
    `
    parameters.push(used_by)
  }

  try {
    const results = await execute_sqlite_query({ query, parameters })
    const tag_set = new Set(results.map((row) => row.tag_base_uri))
    log('Found %d tags used by %s', tag_set.size, used_by)
    return tag_set
  } catch (error) {
    log('Error querying tags used by %s: %s', used_by, error.message)
    throw error
  }
}

export async function query_tag_statistics_from_sqlite({
  include_zero_count = false
} = {}) {
  log('Querying tag statistics from SQLite')

  const query = include_zero_count
    ? `
      WITH entity_counts AS (
        SELECT tag_base_uri, COUNT(*) AS entity_count
        FROM entity_tags
        GROUP BY tag_base_uri
      ),
      thread_counts AS (
        SELECT tag_base_uri, COUNT(*) AS thread_count
        FROM thread_tags
        GROUP BY tag_base_uri
      )
      SELECT
        t.base_uri AS tag_base_uri,
        t.title,
        COALESCE(ec.entity_count, 0) AS entity_count,
        COALESCE(tc.thread_count, 0) AS thread_count
      FROM entities t
      LEFT JOIN entity_counts ec ON ec.tag_base_uri = t.base_uri
      LEFT JOIN thread_counts tc ON tc.tag_base_uri = t.base_uri
      WHERE t.type = 'tag' AND (t.archived = 0 OR t.archived IS NULL)
      ORDER BY entity_count DESC, t.title ASC
    `
    : `
      WITH entity_counts AS (
        SELECT tag_base_uri, COUNT(*) AS entity_count
        FROM entity_tags
        GROUP BY tag_base_uri
      ),
      thread_counts AS (
        SELECT tag_base_uri, COUNT(*) AS thread_count
        FROM thread_tags
        GROUP BY tag_base_uri
      ),
      all_tags AS (
        SELECT tag_base_uri FROM entity_counts
        UNION
        SELECT tag_base_uri FROM thread_counts
      )
      SELECT
        a.tag_base_uri,
        t.title,
        COALESCE(ec.entity_count, 0) AS entity_count,
        COALESCE(tc.thread_count, 0) AS thread_count
      FROM all_tags a
      LEFT JOIN entities t ON t.base_uri = a.tag_base_uri
      LEFT JOIN entity_counts ec ON ec.tag_base_uri = a.tag_base_uri
      LEFT JOIN thread_counts tc ON tc.tag_base_uri = a.tag_base_uri
      ORDER BY entity_count DESC, COALESCE(t.title, a.tag_base_uri) ASC
    `

  try {
    const results = await execute_sqlite_query({ query, parameters: [] })

    const stats = results.map((row) => ({
      tag_base_uri: row.tag_base_uri,
      title: row.title || row.tag_base_uri,
      entity_count: Number(row.entity_count) || 0,
      thread_count: Number(row.thread_count) || 0
    }))

    log('Found statistics for %d tags', stats.length)
    return stats
  } catch (error) {
    log('Error querying tag statistics: %s', error.message)
    throw error
  }
}

function extract_relation_display_fields(relations) {
  const fields = {
    home_area: null,
    current_location: null,
    home_activity: null
  }

  if (!Array.isArray(relations)) return fields

  for (const rel of relations) {
    if (typeof rel !== 'string') continue

    if (!fields.home_area && rel.startsWith('target_area ')) {
      fields.home_area = extract_label_from_relation(rel)
    } else if (
      !fields.current_location &&
      rel.startsWith('current_location ')
    ) {
      fields.current_location = extract_label_from_relation(rel)
    } else if (!fields.home_activity && rel.startsWith('used_in ')) {
      fields.home_activity = extract_label_from_relation(rel)
    }
  }

  return fields
}

function extract_label_from_relation(rel_string) {
  const match = rel_string.match(/\[\[([^\]]+)\]\]/)
  if (!match) return null

  const uri = match[1]
  const filename = uri.split('/').pop()?.replace(/\.md$/, '') || ''
  return filename
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

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
    misc_notes: frontmatter.misc_notes || null,

    ...extract_relation_display_fields(frontmatter.relations),

    tags: entity.tags_aggregated
      ? entity.tags_aggregated.split('||').filter(Boolean)
      : []
  }
}

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
  const { where_sql, parameters } = build_sqlite_where_clause({
    filters: regular_filters,
    frontmatter_columns: PHYSICAL_ITEM_FRONTMATTER_COLUMNS
  })
  const order_sql = build_sqlite_order_clause({
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
    const results = await execute_sqlite_query({
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
  const { where_sql, parameters } = build_sqlite_where_clause({
    filters: regular_filters,
    frontmatter_columns: PHYSICAL_ITEM_FRONTMATTER_COLUMNS
  })
  const final_where = combine_where_clauses({
    base_where: where_sql,
    additional_condition: tag_conditions.sql
  })

  const query = `SELECT COUNT(*) as count FROM entities e ${final_where}`

  try {
    const results = await execute_sqlite_query({
      query,
      parameters: [...parameters, ...tag_conditions.parameters]
    })
    const count = Number(results[0]?.count) || 0
    log('Physical item count from entities: %d', count)
    return count
  } catch (error) {
    log('Error counting physical items from entities: %s', error.message)
    throw error
  }
}
