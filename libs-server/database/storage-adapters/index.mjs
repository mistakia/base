/**
 * Storage Adapter Factory
 *
 * Provides factory function to get the appropriate storage adapter
 * based on database entity storage_config.
 *
 * Supports cross-machine access via storage_config.host:
 * - If host is omitted or matches current machine: uses local adapter
 * - If host is remote: uses SSH-based remote adapter
 */

import debug from 'debug'

import { is_local_host } from '../is-local-host.mjs'

const log = debug('database:storage-adapters')

/**
 * Storage Adapter Interface
 *
 * All storage adapters must implement these methods:
 *
 * - initialize(database_entity) - Set up adapter with database config
 * - create_table(database_entity) - Create/sync table from schema
 * - insert(records) - Insert records with validation
 * - query({ filter, sort, limit, offset }) - Query with filtering, sorting, pagination
 * - update(id, fields) - Update specific record
 * - delete(id) - Delete record
 * - count(filter) - Count matching records
 * - close() - Clean up resources
 */

/**
 * Get storage adapter for a database entity
 *
 * @param {Object} database_entity - Database entity with storage_config
 * @returns {Object} Storage adapter instance
 */
export async function get_storage_adapter(database_entity) {
  const storage_config = database_entity.storage_config || {}
  const backend = storage_config.backend || 'sqlite'
  const host = storage_config.host
  const is_local = is_local_host({ host })

  log(
    'Getting storage adapter for backend: %s (host: %s, local: %s)',
    backend,
    host || 'none',
    is_local
  )

  switch (backend) {
    case 'duckdb': {
      if (!is_local) {
        const { create_duckdb_remote_adapter } = await import(
          './duckdb-remote.mjs'
        )
        return create_duckdb_remote_adapter({
          host,
          database_path: storage_config.database,
          database_entity
        })
      }
      const { create_duckdb_adapter } = await import('./duckdb-adapter.mjs')
      return create_duckdb_adapter(database_entity)
    }
    case 'tsv': {
      if (!is_local) {
        const { create_tsv_remote_adapter } = await import('./tsv-remote.mjs')
        return create_tsv_remote_adapter({
          host,
          file_path: storage_config.path,
          database_entity
        })
      }
      const { create_tsv_adapter } = await import('./tsv-adapter.mjs')
      return create_tsv_adapter(database_entity)
    }
    case 'postgres': {
      // PostgreSQL uses connection_string which already handles remote access
      const { create_postgres_adapter } = await import('./postgres-adapter.mjs')
      return create_postgres_adapter(database_entity)
    }
    case 'markdown': {
      // Markdown uses git sync for cross-machine access
      const { create_markdown_adapter } = await import('./markdown-adapter.mjs')
      return create_markdown_adapter(database_entity)
    }
    case 'sqlite': {
      if (!is_local) {
        const { create_sqlite_remote_adapter } = await import(
          './sqlite-remote.mjs'
        )
        return create_sqlite_remote_adapter({
          host,
          database_path: storage_config.database,
          database_entity
        })
      }
      const { create_sqlite_adapter } = await import('./sqlite-adapter.mjs')
      return create_sqlite_adapter(database_entity)
    }
    default:
      throw new Error(`Unknown storage backend: ${backend}`)
  }
}

/**
 * Map database schema field type to SQL type
 *
 * @param {string} field_type - Field type from database schema
 * @returns {string} SQL column type
 */
export function map_field_type_to_sql(field_type) {
  const type_map = {
    string: 'VARCHAR',
    number: 'DOUBLE',
    boolean: 'BOOLEAN',
    datetime: 'TIMESTAMP',
    array: 'JSON',
    object: 'JSON'
  }
  return type_map[field_type] || 'VARCHAR'
}

/**
 * Parse filter expression into structured filter object
 *
 * Supports formats:
 * - "field=value" - exact match
 * - "field>value" - greater than
 * - "field<value" - less than
 * - "field>=value" - greater than or equal
 * - "field<=value" - less than or equal
 * - "field!=value" - not equal
 * - "field~value" - contains (LIKE %value%)
 *
 * @param {string} filter_expr - Filter expression string
 * @returns {Object} Parsed filter { field, operator, value }
 */
export function parse_filter_expression(filter_expr) {
  const operators = ['>=', '<=', '!=', '~', '>', '<', '=']

  for (const op of operators) {
    const index = filter_expr.indexOf(op)
    if (index !== -1) {
      const field = filter_expr.substring(0, index).trim()
      const value = filter_expr.substring(index + op.length).trim()
      return { field, operator: op, value }
    }
  }

  throw new Error(`Invalid filter expression: ${filter_expr}`)
}

export default {
  get_storage_adapter,
  map_field_type_to_sql,
  parse_filter_expression
}
