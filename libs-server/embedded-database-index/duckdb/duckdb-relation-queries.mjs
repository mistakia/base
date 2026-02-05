/**
 * DuckDB Relation Queries
 *
 * SQL equivalents for entity relation queries using standard SQL JOINs.
 */

import debug from 'debug'

import { execute_duckdb_query } from './duckdb-database-client.mjs'

const log = debug('embedded-index:duckdb:relations')

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
    SELECT e.base_uri, e.entity_id, e.type, e.title, e.updated_at,
           er.relation_type, er.context
    FROM entity_relations er
    JOIN entities e ON er.target_base_uri = e.base_uri
    WHERE ${where_clauses.join(' AND ')}
    LIMIT ? OFFSET ?
  `

  try {
    const rows = await execute_duckdb_query({ query, parameters })

    log('Found %d related entities', rows.length)
    return rows.map((row) => ({
      base_uri: row.base_uri,
      entity_id: row.entity_id,
      type: row.type,
      title: row.title,
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

  const where_clauses = ['er.target_base_uri = ?']
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
    SELECT e.base_uri, e.entity_id, e.type, e.title, e.updated_at,
           er.relation_type, er.context
    FROM entity_relations er
    JOIN entities e ON er.source_base_uri = e.base_uri
    WHERE ${where_clauses.join(' AND ')}
    LIMIT ? OFFSET ?
  `

  try {
    const rows = await execute_duckdb_query({ query, parameters })

    log('Found %d entities relating to target', rows.length)
    return rows.map((row) => ({
      base_uri: row.base_uri,
      entity_id: row.entity_id,
      type: row.type,
      title: row.title,
      updated_at: row.updated_at,
      relation_type: row.relation_type,
      context: row.context
    }))
  } catch (error) {
    log('Error finding entities relating to: %s', error.message)
    throw error
  }
}
