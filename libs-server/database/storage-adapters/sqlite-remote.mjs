/**
 * Remote SQLite Storage Adapter
 *
 * Executes SQLite queries on remote hosts via SSH using the sqlite3 CLI.
 * Used when storage_config.host specifies a remote machine.
 */

import debug from 'debug'

import { map_field_type_to_sql, parse_filter_expression } from './index.mjs'
import { execute_ssh, escape_shell_arg } from './ssh-utils.mjs'

const log = debug('database:adapter:sqlite-remote')

function escape_sql_string(value, for_like = false) {
  if (value === null || value === undefined) {
    return 'NULL'
  }
  if (typeof value === 'number') {
    return String(value)
  }
  if (typeof value === 'boolean') {
    return value ? '1' : '0'
  }
  let str = String(value)
  str = str.replace(/'/g, "''")
  if (for_like) {
    str = str.replace(/%/g, '\\%').replace(/_/g, '\\_')
  }
  return `'${str}'`
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

function build_where_clause(filter) {
  if (!filter) {
    return ''
  }

  const conditions = []

  if (typeof filter === 'object' && !Array.isArray(filter)) {
    for (const [field, value] of Object.entries(filter)) {
      conditions.push(`"${field}" = ${escape_sql_string(value)}`)
    }
  }

  if (typeof filter === 'string') {
    const parsed = parse_filter_expression(filter)
    conditions.push(build_condition(parsed))
  }

  if (Array.isArray(filter)) {
    for (const expr of filter) {
      if (typeof expr === 'string') {
        const parsed = parse_filter_expression(expr)
        conditions.push(build_condition(parsed))
      }
    }
  }

  if (conditions.length === 0) {
    return ''
  }

  return `WHERE ${conditions.join(' AND ')}`
}

function build_condition(parsed) {
  const { field, operator, value } = parsed

  if (operator === '~') {
    const escaped = escape_sql_string(value, true)
    const inner = escaped.slice(1, -1)
    return `"${field}" LIKE '%${inner}%'`
  }

  const sql_operator = operator === '!=' ? '<>' : operator
  return `"${field}" ${sql_operator} ${escape_sql_string(value)}`
}

function build_order_clause(sort) {
  if (!sort) {
    return ''
  }

  if (typeof sort === 'string') {
    const desc = sort.startsWith('-')
    const field = desc ? sort.substring(1) : sort
    return `ORDER BY "${field}" ${desc ? 'DESC' : 'ASC'}`
  }

  if (Array.isArray(sort)) {
    const parts = sort.map((s) => {
      const desc = s.startsWith('-')
      const field = desc ? s.substring(1) : s
      return `"${field}" ${desc ? 'DESC' : 'ASC'}`
    })
    return `ORDER BY ${parts.join(', ')}`
  }

  return ''
}

/**
 * Create remote SQLite adapter
 *
 * @param {Object} options - Adapter options
 * @param {string} options.host - SSH config host alias
 * @param {string} options.database_path - Path to .sqlite file on remote host
 * @param {Object} options.database_entity - Database entity with schema
 * @returns {Object} Storage adapter instance
 */
export function create_sqlite_remote_adapter({
  host,
  database_path,
  database_entity
}) {
  const table_name = get_table_name(database_entity)
  const pk_field = get_primary_key_field(database_entity)
  const fields = database_entity.fields || []

  log(
    'Creating remote SQLite adapter: %s:%s table=%s',
    host,
    database_path,
    table_name
  )

  async function execute_query(sql) {
    const escaped_path = escape_shell_arg(database_path)
    const escaped_sql = escape_shell_arg(sql)
    const command = `sqlite3 -json ${escaped_path} ${escaped_sql}`

    const output = await execute_ssh(host, command)

    if (!output.trim()) {
      return []
    }

    try {
      return JSON.parse(output)
    } catch (err) {
      log('Failed to parse SQLite JSON output: %s', output.substring(0, 200))
      throw new Error(`Failed to parse SQLite output: ${err.message}`)
    }
  }

  async function execute_run(sql) {
    const escaped_path = escape_shell_arg(database_path)
    const escaped_sql = escape_shell_arg(sql)
    const command = `sqlite3 ${escaped_path} ${escaped_sql}`
    await execute_ssh(host, command)
  }

  return {
    async create_table() {
      log('Creating table: %s', table_name)

      if (fields.length === 0) {
        throw new Error('Database entity has no fields defined')
      }

      const column_definitions = fields.map((field) => {
        const sql_type = map_field_type_to_sql(field.type || 'string')
        const nullable = field.required ? 'NOT NULL' : ''
        const primary = field.primary_key ? 'PRIMARY KEY' : ''
        return `"${field.name}" ${sql_type} ${nullable} ${primary}`.trim()
      })

      const create_sql = `CREATE TABLE IF NOT EXISTS "${table_name}" (${column_definitions.join(', ')})`
      await execute_run(create_sql)

      const storage_config = database_entity.storage_config || {}
      const indexes = storage_config.indexes || []

      for (let i = 0; i < indexes.length; i++) {
        const index = indexes[i]
        const index_name = `idx_${table_name}_${i}`
        const unique = index.unique ? 'UNIQUE' : ''
        const columns = index.fields.map((f) => `"${f}"`).join(', ')
        const index_sql = `CREATE ${unique} INDEX IF NOT EXISTS "${index_name}" ON "${table_name}" (${columns})`
        await execute_run(index_sql)
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

      const field_names = fields.map((f) => f.name)
      const columns = field_names.map((n) => `"${n}"`).join(', ')

      const value_sets = records.map((record) => {
        const values = field_names.map((name) =>
          escape_sql_string(record[name])
        )
        return `(${values.join(', ')})`
      })

      const insert_sql = `INSERT INTO "${table_name}" (${columns}) VALUES ${value_sets.join(', ')}`
      await execute_run(insert_sql)

      log('Inserted %d records', records.length)
      return { inserted: records.length }
    },

    async query({ filter, sort, limit = 1000, offset = 0 } = {}) {
      log('Querying table: %s', table_name)

      const where_clause = build_where_clause(filter)
      const order_clause = build_order_clause(sort)

      const sql = `SELECT * FROM "${table_name}" ${where_clause} ${order_clause} LIMIT ${limit} OFFSET ${offset}`
      const results = await execute_query(sql)

      log('Found %d records', results.length)
      return results
    },

    async update(id, update_fields) {
      if (!pk_field) {
        throw new Error('No primary key field defined for this database')
      }

      log('Updating record %s in %s', id, table_name)

      const set_parts = []
      for (const [key, value] of Object.entries(update_fields)) {
        set_parts.push(`"${key}" = ${escape_sql_string(value)}`)
      }

      if (set_parts.length === 0) {
        return { updated: 0 }
      }

      const update_sql = `UPDATE "${table_name}" SET ${set_parts.join(', ')} WHERE "${pk_field}" = ${escape_sql_string(id)}`
      await execute_run(update_sql)

      log('Record updated')
      return { updated: 1 }
    },

    async delete(id) {
      if (!pk_field) {
        throw new Error('No primary key field defined for this database')
      }

      log('Deleting record %s from %s', id, table_name)

      const delete_sql = `DELETE FROM "${table_name}" WHERE "${pk_field}" = ${escape_sql_string(id)}`
      await execute_run(delete_sql)

      log('Record deleted')
      return { deleted: 1 }
    },

    async count(filter) {
      log('Counting records in %s', table_name)

      const where_clause = build_where_clause(filter)
      const sql = `SELECT COUNT(*) as count FROM "${table_name}" ${where_clause}`
      const results = await execute_query(sql)

      const count = results[0]?.count || 0
      log('Count: %d', count)
      return count
    },

    async close() {
      log('Remote SQLite adapter closed')
    }
  }
}

export default { create_sqlite_remote_adapter }
