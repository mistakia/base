/**
 * DuckDB Storage Adapter
 *
 * Provides storage backend using embedded DuckDB database.
 * Tables are created dynamically from database entity schema.
 */

import debug from 'debug'

import {
  execute_duckdb_query,
  execute_duckdb_run,
  is_duckdb_initialized
} from '../../embedded-database-index/duckdb/duckdb-database-client.mjs'
import { map_field_type_to_sql, parse_filter_expression } from './index.mjs'

const log = debug('database:adapter:duckdb')

/**
 * Map schema field type to DuckDB type
 */
function get_duckdb_type(field) {
  const type = field.type || 'string'
  return map_field_type_to_sql(type)
}

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
    const sql_type = get_duckdb_type(field)
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

/**
 * Get table name from database entity
 */
function get_table_name(database_entity) {
  const storage_config = database_entity.storage_config || {}
  return storage_config.table || database_entity.table_name
}

/**
 * Get primary key field name
 */
function get_primary_key_field(database_entity) {
  const fields = database_entity.fields || []
  const pk_field = fields.find((f) => f.primary_key)
  return pk_field?.name || null
}

/**
 * Build WHERE clause from filter object
 */
function build_where_clause(filter, database_entity) {
  if (!filter) {
    return { clause: '', params: [] }
  }

  const conditions = []
  const params = []
  let param_index = 1

  // Handle filter as object with field:value pairs
  if (typeof filter === 'object' && !Array.isArray(filter)) {
    for (const [field, value] of Object.entries(filter)) {
      conditions.push(`"${field}" = $${param_index}`)
      params.push(value)
      param_index++
    }
  }

  // Handle filter as string expression
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

    conditions.push(`"${parsed.field}" ${operator} $${param_index}`)
    params.push(param_value)
  }

  // Handle filter as array of expressions
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

        conditions.push(`"${parsed.field}" ${operator} $${param_index}`)
        params.push(param_value)
        param_index++
      }
    }
  }

  if (conditions.length === 0) {
    return { clause: '', params: [] }
  }

  return { clause: `WHERE ${conditions.join(' AND ')}`, params }
}

/**
 * Create DuckDB adapter for a database entity
 */
export function create_duckdb_adapter(database_entity) {
  const table_name = get_table_name(database_entity)
  const pk_field = get_primary_key_field(database_entity)

  log('Creating DuckDB adapter for table: %s', table_name)

  return {
    /**
     * Create or sync table from database schema
     */
    async create_table() {
      if (!is_duckdb_initialized()) {
        throw new Error('DuckDB not initialized')
      }

      log('Creating table: %s', table_name)

      const create_sql = generate_create_table_sql(database_entity)
      await execute_duckdb_run({ query: create_sql })

      const index_statements = generate_index_sql(database_entity)
      for (const index_sql of index_statements) {
        await execute_duckdb_run({ query: index_sql })
      }

      log('Table created: %s', table_name)
    },

    /**
     * Insert records into the table
     */
    async insert(records) {
      if (!is_duckdb_initialized()) {
        throw new Error('DuckDB not initialized')
      }

      if (!Array.isArray(records)) {
        records = [records]
      }

      if (records.length === 0) {
        return { inserted: 0 }
      }

      log('Inserting %d records into %s', records.length, table_name)

      const fields = database_entity.fields || []
      const field_names = fields.map((f) => f.name)
      const columns = field_names.map((n) => `"${n}"`).join(', ')

      // Build batch insert with multiple value sets
      const all_values = []
      const value_sets = []
      let param_index = 1

      for (const record of records) {
        const placeholders = field_names
          .map(() => `$${param_index++}`)
          .join(', ')
        value_sets.push(`(${placeholders})`)
        for (const name of field_names) {
          all_values.push(record[name] ?? null)
        }
      }

      await execute_duckdb_run({
        query: `INSERT INTO "${table_name}" (${columns}) VALUES ${value_sets.join(', ')}`,
        parameters: all_values
      })

      log('Inserted %d records', records.length)
      return { inserted: records.length }
    },

    /**
     * Query records with filtering, sorting, pagination
     */
    async query({ filter, sort, limit = 1000, offset = 0 } = {}) {
      if (!is_duckdb_initialized()) {
        throw new Error('DuckDB not initialized')
      }

      log('Querying table: %s', table_name)

      const { clause: where_clause, params } = build_where_clause(
        filter,
        database_entity
      )

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

      const query = `
        SELECT * FROM "${table_name}"
        ${where_clause}
        ${order_clause}
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `

      const results = await execute_duckdb_query({
        query,
        parameters: [...params, limit, offset]
      })

      log('Found %d records', results.length)
      return results
    },

    /**
     * Update a record by primary key
     */
    async update(id, fields) {
      if (!is_duckdb_initialized()) {
        throw new Error('DuckDB not initialized')
      }

      if (!pk_field) {
        throw new Error('No primary key field defined for this database')
      }

      log('Updating record %s in %s', id, table_name)

      const set_parts = []
      const params = []
      let param_index = 1

      for (const [key, value] of Object.entries(fields)) {
        set_parts.push(`"${key}" = $${param_index}`)
        params.push(value)
        param_index++
      }

      if (set_parts.length === 0) {
        return { updated: 0 }
      }

      params.push(id)

      await execute_duckdb_run({
        query: `UPDATE "${table_name}" SET ${set_parts.join(', ')} WHERE "${pk_field}" = $${param_index}`,
        parameters: params
      })

      log('Record updated')
      return { updated: 1 }
    },

    /**
     * Delete a record by primary key
     */
    async delete(id) {
      if (!is_duckdb_initialized()) {
        throw new Error('DuckDB not initialized')
      }

      if (!pk_field) {
        throw new Error('No primary key field defined for this database')
      }

      log('Deleting record %s from %s', id, table_name)

      await execute_duckdb_run({
        query: `DELETE FROM "${table_name}" WHERE "${pk_field}" = $1`,
        parameters: [id]
      })

      log('Record deleted')
      return { deleted: 1 }
    },

    /**
     * Count records matching filter
     */
    async count(filter) {
      if (!is_duckdb_initialized()) {
        throw new Error('DuckDB not initialized')
      }

      log('Counting records in %s', table_name)

      const { clause: where_clause, params } = build_where_clause(
        filter,
        database_entity
      )

      const results = await execute_duckdb_query({
        query: `SELECT COUNT(*) as count FROM "${table_name}" ${where_clause}`,
        parameters: params
      })

      const count_value = results[0]?.count
      const count =
        typeof count_value === 'bigint' ? Number(count_value) : count_value || 0

      log('Count: %d', count)
      return count
    },

    /**
     * Close adapter (no-op for DuckDB as connection is shared)
     */
    async close() {
      log('DuckDB adapter closed (connection shared)')
    }
  }
}

export default { create_duckdb_adapter }
