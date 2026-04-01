/**
 * SQLite Relation Queries
 *
 * SQL equivalents for entity relation queries using standard SQL JOINs.
 */

import debug from 'debug'

import { execute_sqlite_query } from './sqlite-database-client.mjs'

const log = debug('embedded-index:sqlite:relations')

export async function find_related_entities({
  base_uri,
  relation_type = null,
  entity_type = null,
  limit = 100,
  offset = 0
}) {
  if (!base_uri) {
    return []
  }

  log(
    'Finding entities related from: %s (relation_type: %s, entity_type: %s)',
    base_uri,
    relation_type,
    entity_type
  )

  const limit_int = Math.max(0, Math.floor(Number(limit) || 100))
  const offset_int = Math.max(0, Math.floor(Number(offset) || 0))

  const where_clauses = ['er.source_base_uri = ?']
  const parameters = [base_uri]

  if (relation_type) {
    where_clauses.push('er.relation_type = ?')
    parameters.push(relation_type)
  }

  if (entity_type) {
    where_clauses.push('e.type = ?')
    parameters.push(entity_type)
  }

  parameters.push(limit_int, offset_int)

  const query = `
    SELECT e.base_uri, e.entity_id, e.type, e.title, e.status, e.updated_at,
           er.relation_type, er.context
    FROM entity_relations er
    JOIN entities e ON er.target_base_uri = e.base_uri
    WHERE ${where_clauses.join(' AND ')}
    LIMIT ? OFFSET ?
  `

  try {
    const rows = await execute_sqlite_query({ query, parameters })

    log('Found %d related entities', rows.length)
    return rows.map((row) => ({
      base_uri: row.base_uri,
      entity_id: row.entity_id,
      type: row.type,
      title: row.title,
      status: row.status,
      updated_at: row.updated_at,
      relation_type: row.relation_type,
      context: row.context
    }))
  } catch (error) {
    log('Error finding related entities: %s', error.message)
    throw error
  }
}

export async function find_entities_relating_to({
  base_uri,
  relation_type = null,
  entity_type = null,
  limit = 100,
  offset = 0
}) {
  if (!base_uri) {
    return []
  }

  log(
    'Finding entities relating to: %s (relation_type: %s, entity_type: %s)',
    base_uri,
    relation_type,
    entity_type
  )

  const limit_int = Math.max(0, Math.floor(Number(limit) || 100))
  const offset_int = Math.max(0, Math.floor(Number(offset) || 0))

  const er_where_clauses = ['er.target_base_uri = ?']
  const parameters = [base_uri]

  if (relation_type) {
    er_where_clauses.push('er.relation_type = ?')
    parameters.push(relation_type)
  }

  const entity_type_filter = entity_type ? 'AND e.type = ?' : ''
  const thread_type_filter =
    entity_type === 'thread' ? '' : entity_type ? 'AND 1=0' : ''

  if (entity_type && entity_type !== 'thread') {
    parameters.push(entity_type)
  }

  const thread_params = [base_uri]
  if (relation_type) {
    thread_params.push(relation_type)
  }

  const all_params = [...parameters, ...thread_params, limit_int, offset_int]

  const query = `
    SELECT base_uri, entity_id, type, title, status, updated_at, relation_type, context, thread_state
    FROM (
      SELECT e.base_uri, e.entity_id, e.type, e.title, e.status, e.updated_at,
             er.relation_type, er.context, NULL as thread_state
      FROM entity_relations er
      JOIN entities e ON er.source_base_uri = e.base_uri
      WHERE ${er_where_clauses.join(' AND ')} ${entity_type_filter}

      UNION ALL

      SELECT 'user:thread/' || t.thread_id as base_uri,
             t.thread_id as entity_id,
             'thread' as type,
             t.title,
             NULL as status,
             t.updated_at,
             er.relation_type,
             er.context,
             t.thread_state
      FROM entity_relations er
      JOIN threads t ON er.source_base_uri = 'user:thread/' || t.thread_id
      WHERE ${er_where_clauses.join(' AND ')} ${thread_type_filter}
    ) combined
    ORDER BY updated_at DESC
    LIMIT ? OFFSET ?
  `

  try {
    const rows = await execute_sqlite_query({ query, parameters: all_params })

    log('Found %d entities relating to target', rows.length)
    return rows.map((row) => ({
      base_uri: row.base_uri,
      entity_id: row.entity_id,
      type: row.type,
      title: row.title,
      status: row.status,
      updated_at: row.updated_at,
      relation_type: row.relation_type,
      context: row.context,
      thread_state: row.thread_state
    }))
  } catch (error) {
    log('Error finding entities relating to: %s', error.message)
    throw error
  }
}

export async function find_threads_relating_to({
  base_uri,
  relation_type = null,
  limit = 100,
  offset = 0
}) {
  if (!base_uri) {
    return []
  }

  log(
    'Finding threads relating to: %s (relation_type: %s)',
    base_uri,
    relation_type
  )

  const limit_int = Math.max(0, Math.floor(Number(limit) || 100))
  const offset_int = Math.max(0, Math.floor(Number(offset) || 0))

  const where_clauses = [
    'er.target_base_uri = ?',
    "er.source_base_uri LIKE 'user:thread/%'"
  ]
  const parameters = [base_uri]

  if (relation_type) {
    where_clauses.push('er.relation_type = ?')
    parameters.push(relation_type)
  }

  parameters.push(limit_int, offset_int)

  const query = `
    SELECT t.thread_id,
           t.title,
           t.thread_state,
           t.created_at,
           t.updated_at,
           er.relation_type,
           er.context
    FROM entity_relations er
    JOIN threads t ON er.source_base_uri = 'user:thread/' || t.thread_id
    WHERE ${where_clauses.join(' AND ')}
    ORDER BY t.updated_at DESC
    LIMIT ? OFFSET ?
  `

  try {
    const rows = await execute_sqlite_query({ query, parameters })

    log('Found %d threads relating to target', rows.length)
    return rows.map((row) => ({
      thread_id: row.thread_id,
      title: row.title,
      thread_state: row.thread_state,
      created_at: row.created_at,
      updated_at: row.updated_at,
      relation_type: row.relation_type,
      context: row.context
    }))
  } catch (error) {
    log('Error finding threads relating to: %s', error.message)
    throw error
  }
}
