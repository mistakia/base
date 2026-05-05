/**
 * SQLite Storage Adapter
 *
 * Provides storage backend using standalone SQLite database files via bun:sqlite.
 * Each database entity gets its own .sqlite file.
 * Default storage backend for new installs.
 *
 * Database path resolution:
 * 1. If storage_config.database is set, resolve relative to user-base root
 * 2. Otherwise, derive from base_uri (e.g., user:database/files.md -> database/files.sqlite)
 */

import debug from 'debug'
import fs from 'fs'
import path from 'path'
import { Database } from 'bun:sqlite'

import {
  resolve_base_uri,
  get_user_base_directory
} from '#libs-server/base-uri/index.mjs'
import { map_field_type_to_sql, parse_filter_expression } from './index.mjs'

const log = debug('database:adapter:sqlite')

/**
 * Generate CREATE TABLE SQL from database entity fields
 */
function generate_create_table_sql(database_entity) {
  const table_name = get_table_name(database_entity)
  const fields = database_entity.fields || []

  if (fields.length === 0) {
    throw new Error('Database entity has no fields defined')
  }

  const column_definitions = fields.map((field) => {
    const sql_type = map_field_type_to_sql(field.type || 'string')
    const nullable = field.required ? 'NOT NULL' : ''
    const primary = field.primary_key ? 'PRIMARY KEY' : ''
    return `"${field.name}" ${sql_type} ${nullable} ${primary}`.trim()
  })

  return `CREATE TABLE IF NOT EXISTS "${table_name}" (${column_definitions.join(', ')})`
}

/**
 * Generate index SQL statements from storage_config.indexes
 */
function generate_index_sql(database_entity) {
  const table_name = get_table_name(database_entity)
  const storage_config = database_entity.storage_config || {}
  const indexes = storage_config.indexes || []

  return indexes.map((index, i) => {
    const index_name = `idx_${table_name}_${i}`
    const unique = index.unique ? 'UNIQUE' : ''
    const columns = index.fields.map((f) => `"${f}"`).join(', ')
    return `CREATE ${unique} INDEX IF NOT EXISTS "${index_name}" ON "${table_name}" (${columns})`
  })
}

function get_table_name(database_entity) {
  const storage_config = database_entity.storage_config || {}
  return storage_config.table || database_entity.table_name
}

function get_primary_key_field(database_entity) {
  const fields = database_entity.fields || []
  const pk_field = fields.find((f) => f.primary_key)
  return pk_field?.name || null
}

/**
 * Build WHERE clause from filter object using ? placeholders
 */
function build_where_clause(filter) {
  if (!filter) {
    return { clause: '', params: [] }
  }

  const conditions = []
  const params = []

  if (typeof filter === 'object' && !Array.isArray(filter)) {
    for (const [field, value] of Object.entries(filter)) {
      conditions.push(`"${field}" = ?`)
      params.push(value)
    }
  }

  if (typeof filter === 'string') {
    const parsed = parse_filter_expression(filter)
    let operator = '='
    let param_value = parsed.value

    switch (parsed.operator) {
      case '~':
        operator = 'LIKE'
        param_value = `%${parsed.value}%`
        break
      case '!=':
        operator = '!='
        break
      case '>':
      case '<':
      case '>=':
      case '<=':
        operator = parsed.operator
        break
    }

    conditions.push(`"${parsed.field}" ${operator} ?`)
    params.push(param_value)
  }

  if (Array.isArray(filter)) {
    for (const expr of filter) {
      if (typeof expr === 'string') {
        const parsed = parse_filter_expression(expr)
        let operator = '='
        let param_value = parsed.value

        switch (parsed.operator) {
          case '~':
            operator = 'LIKE'
            param_value = `%${parsed.value}%`
            break
          case '!=':
            operator = '!='
            break
          case '>':
          case '<':
          case '>=':
          case '<=':
            operator = parsed.operator
            break
        }

        conditions.push(`"${parsed.field}" ${operator} ?`)
        params.push(param_value)
      }
    }
  }

  if (conditions.length === 0) {
    return { clause: '', params: [] }
  }

  return { clause: `WHERE ${conditions.join(' AND ')}`, params }
}

/**
 * Get database path from storage_config or auto-derive from base_uri
 */
function get_database_path(database_entity) {
  const storage_config = database_entity.storage_config || {}

  let absolute_path

  if (storage_config.database) {
    const user_base_directory = get_user_base_directory()
    absolute_path = path.resolve(user_base_directory, storage_config.database)
  } else {
    const base_uri = database_entity.base_uri
    if (!base_uri) {
      throw new Error(
        'Database entity must have base_uri to derive database path'
      )
    }
    absolute_path = resolve_base_uri(base_uri).replace(/\.md$/, '.sqlite')
  }

  const parent_dir = path.dirname(absolute_path)
  if (!fs.existsSync(parent_dir)) {
    fs.mkdirSync(parent_dir, { recursive: true })
    log('Created directory: %s', parent_dir)
  }

  return absolute_path
}

/**
 * Create SQLite adapter for a database entity
 *
 * Opens a bun:sqlite connection to a standalone .sqlite file.
 */
export function create_sqlite_adapter(database_entity, { read_only = false } = {}) {
  const table_name = get_table_name(database_entity)
  const pk_field = get_primary_key_field(database_entity)
  const database_path = get_database_path(database_entity)

  let db = null

  log(
    'Creating SQLite adapter for table: %s (path: %s, read_only: %s)',
    table_name,
    database_path,
    read_only
  )

  function ensure_connection() {
    if (!db) {
      if (read_only) {
        db = new Database(database_path, { readonly: true })
      } else {
        db = new Database(database_path)
        db.exec('PRAGMA journal_mode=WAL')
        db.exec('PRAGMA synchronous=NORMAL')
        db.exec('PRAGMA busy_timeout=5000')
      }
      log(
        'Opened SQLite connection to %s (read_only: %s)',
        database_path,
        read_only
      )
    }
    return db
  }

  return {
    async create_table() {
      log('Creating table: %s', table_name)

      const conn = ensure_connection()
      const create_sql = generate_create_table_sql(database_entity)
      conn.exec(create_sql)

      const index_statements = generate_index_sql(database_entity)
      for (const index_sql of index_statements) {
        conn.exec(index_sql)
      }

      log('Table created: %s', table_name)
    },

    async insert(records) {
      if (!Array.isArray(records)) {
        records = [records]
      }

      if (records.length === 0) {
        return { inserted: 0 }
      }

      log('Inserting %d records into %s', records.length, table_name)

      const conn = ensure_connection()
      const fields = database_entity.fields || []
      const field_names = fields.map((f) => f.name)
      const columns = field_names.map((n) => `"${n}"`).join(', ')

      const all_values = []
      const value_sets = []

      for (const record of records) {
        const placeholders = field_names.map(() => '?').join(', ')
        value_sets.push(`(${placeholders})`)
        for (const name of field_names) {
          all_values.push(record[name] ?? null)
        }
      }

      conn
        .prepare(
          `INSERT INTO "${table_name}" (${columns}) VALUES ${value_sets.join(', ')}`
        )
        .run(...all_values)

      log('Inserted %d records', records.length)
      return { inserted: records.length }
    },

    async query({ filter, sort, limit = 1000, offset = 0 } = {}) {
      log('Querying table: %s', table_name)

      const conn = ensure_connection()
      const { clause: where_clause, params } = build_where_clause(filter)

      let order_clause = ''
      if (sort) {
        if (typeof sort === 'string') {
          const desc = sort.startsWith('-')
          const field = desc ? sort.substring(1) : sort
          order_clause = `ORDER BY "${field}" ${desc ? 'DESC' : 'ASC'}`
        } else if (Array.isArray(sort)) {
          const parts = sort.map((s) => {
            const desc = s.startsWith('-')
            const field = desc ? s.substring(1) : s
            return `"${field}" ${desc ? 'DESC' : 'ASC'}`
          })
          order_clause = `ORDER BY ${parts.join(', ')}`
        }
      }

      const sql = `
        SELECT * FROM "${table_name}"
        ${where_clause}
        ${order_clause}
        LIMIT ? OFFSET ?
      `

      const results = conn.prepare(sql).all(...params, limit, offset)

      log('Found %d records', results.length)
      return results
    },

    async update(id, fields) {
      if (!pk_field) {
        throw new Error('No primary key field defined for this database')
      }

      log('Updating record %s in %s', id, table_name)

      const conn = ensure_connection()
      const set_parts = []
      const params = []

      for (const [key, value] of Object.entries(fields)) {
        set_parts.push(`"${key}" = ?`)
        params.push(value)
      }

      if (set_parts.length === 0) {
        return { updated: 0 }
      }

      params.push(id)

      conn
        .prepare(
          `UPDATE "${table_name}" SET ${set_parts.join(', ')} WHERE "${pk_field}" = ?`
        )
        .run(...params)

      log('Record updated')
      return { updated: 1 }
    },

    async delete(id) {
      if (!pk_field) {
        throw new Error('No primary key field defined for this database')
      }

      log('Deleting record %s from %s', id, table_name)

      const conn = ensure_connection()
      conn
        .prepare(`DELETE FROM "${table_name}" WHERE "${pk_field}" = ?`)
        .run(id)

      log('Record deleted')
      return { deleted: 1 }
    },

    async count(filter) {
      log('Counting records in %s', table_name)

      const conn = ensure_connection()
      const { clause: where_clause, params } = build_where_clause(filter)

      const result = conn
        .prepare(
          `SELECT COUNT(*) as count FROM "${table_name}" ${where_clause}`
        )
        .all(...params)

      const count = Number(result[0]?.count) || 0
      log('Count: %d', count)
      return count
    },

    async execute({ query, parameters = [] }) {
      const conn = ensure_connection()
      conn.prepare(query).run(...parameters)
    },

    async raw_query({ query, parameters = [] }) {
      const conn = ensure_connection()
      return conn.prepare(query).all(...parameters)
    },

    async close() {
      if (db) {
        db.close()
        db = null
        log('SQLite adapter closed')
      }
    }
  }
}

export default { create_sqlite_adapter }
