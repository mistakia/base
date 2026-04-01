/**
 * PostgreSQL Storage Adapter
 *
 * Provides storage backend using external PostgreSQL database.
 * Requires the 'pg' package to be installed.
 */

import debug from 'debug'

import { parse_filter_expression } from './index.mjs'

const log = debug('database:adapter:postgres')

let pg_module = null

/**
 * Lazy load pg module
 */
async function get_pg() {
  if (!pg_module) {
    try {
      pg_module = await import('pg')
    } catch {
      throw new Error(
        'PostgreSQL adapter requires the "pg" package. Install with: bun add pg'
      )
    }
  }
  return pg_module
}

/**
 * Map schema field type to PostgreSQL type
 */
function get_postgres_type(field) {
  const type = field.type || 'string'
  const type_map = {
    string: 'TEXT',
    number: 'DOUBLE PRECISION',
    boolean: 'BOOLEAN',
    datetime: 'TIMESTAMPTZ',
    array: 'JSONB',
    object: 'JSONB'
  }
  return type_map[type] || 'TEXT'
}

/**
 * Generate CREATE TABLE SQL from database entity fields
 */
function generate_create_table_sql(database_entity, schema_name) {
  const table_name = get_table_name(database_entity)
  const fields = database_entity.fields || []

  if (fields.length === 0) {
    throw new Error('Database entity has no fields defined')
  }

  const column_definitions = fields.map((field) => {
    const sql_type = get_postgres_type(field)
    const nullable = field.required ? 'NOT NULL' : ''
    const primary = field.primary_key ? 'PRIMARY KEY' : ''
    return `"${field.name}" ${sql_type} ${nullable} ${primary}`.trim()
  })

  return `CREATE TABLE IF NOT EXISTS "${schema_name}"."${table_name}" (${column_definitions.join(', ')})`
}

/**
 * Generate index SQL statements
 */
function generate_index_sql(database_entity, schema_name) {
  const table_name = get_table_name(database_entity)
  const storage_config = database_entity.storage_config || {}
  const indexes = storage_config.indexes || []

  return indexes.map((index, i) => {
    const index_name = `idx_${table_name}_${i}`
    const unique = index.unique ? 'UNIQUE' : ''
    const columns = index.fields.map((f) => `"${f}"`).join(', ')
    return `CREATE ${unique} INDEX IF NOT EXISTS "${index_name}" ON "${schema_name}"."${table_name}" (${columns})`
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
 * Get schema name from storage config
 */
function get_schema_name(database_entity) {
  const storage_config = database_entity.storage_config || {}
  return storage_config.schema_name || 'public'
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
        operator = 'ILIKE'
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
            operator = 'ILIKE'
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
 * Create PostgreSQL adapter for a database entity
 */
export async function create_postgres_adapter(database_entity) {
  const storage_config = database_entity.storage_config || {}
  const connection_string = storage_config.connection_string

  if (!connection_string) {
    throw new Error(
      'PostgreSQL adapter requires storage_config.connection_string'
    )
  }

  const pg = await get_pg()
  const Pool = pg.default?.Pool || pg.Pool

  const table_name = get_table_name(database_entity)
  const schema_name = get_schema_name(database_entity)
  const pk_field = get_primary_key_field(database_entity)
  const fields = database_entity.fields || []

  log('Creating PostgreSQL adapter for table: %s.%s', schema_name, table_name)

  const pool = new Pool({ connectionString: connection_string })

  return {
    /**
     * Create or sync table from database schema
     */
    async create_table() {
      log('Creating table: %s.%s', schema_name, table_name)

      const client = await pool.connect()
      try {
        // Ensure schema exists
        await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema_name}"`)

        // Create table
        const create_sql = generate_create_table_sql(
          database_entity,
          schema_name
        )
        await client.query(create_sql)

        // Create indexes
        const index_statements = generate_index_sql(
          database_entity,
          schema_name
        )
        for (const index_sql of index_statements) {
          await client.query(index_sql)
        }

        log('Table created: %s.%s', schema_name, table_name)
      } finally {
        client.release()
      }
    },

    /**
     * Insert records into the table
     */
    async insert(records) {
      if (!Array.isArray(records)) {
        records = [records]
      }

      if (records.length === 0) {
        return { inserted: 0 }
      }

      log(
        'Inserting %d records into %s.%s',
        records.length,
        schema_name,
        table_name
      )

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

      const client = await pool.connect()
      try {
        await client.query(
          `INSERT INTO "${schema_name}"."${table_name}" (${columns}) VALUES ${value_sets.join(', ')}`,
          all_values
        )

        log('Inserted %d records', records.length)
        return { inserted: records.length }
      } finally {
        client.release()
      }
    },

    /**
     * Query records with filtering, sorting, pagination
     */
    async query({ filter, sort, limit = 1000, offset = 0 } = {}) {
      log('Querying table: %s.%s', schema_name, table_name)

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
        SELECT * FROM "${schema_name}"."${table_name}"
        ${where_clause}
        ${order_clause}
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `

      const result = await pool.query(query, [...params, limit, offset])

      log('Found %d records', result.rows.length)
      return result.rows
    },

    /**
     * Update a record by primary key
     */
    async update(id, update_fields) {
      if (!pk_field) {
        throw new Error('No primary key field defined for this database')
      }

      log('Updating record %s in %s.%s', id, schema_name, table_name)

      const set_parts = []
      const params = []
      let param_index = 1

      for (const [key, value] of Object.entries(update_fields)) {
        set_parts.push(`"${key}" = $${param_index}`)
        params.push(value)
        param_index++
      }

      if (set_parts.length === 0) {
        return { updated: 0 }
      }

      params.push(id)

      const result = await pool.query(
        `UPDATE "${schema_name}"."${table_name}" SET ${set_parts.join(', ')} WHERE "${pk_field}" = $${param_index}`,
        params
      )

      log('Updated %d records', result.rowCount)
      return { updated: result.rowCount }
    },

    /**
     * Delete a record by primary key
     */
    async delete(id) {
      if (!pk_field) {
        throw new Error('No primary key field defined for this database')
      }

      log('Deleting record %s from %s.%s', id, schema_name, table_name)

      const result = await pool.query(
        `DELETE FROM "${schema_name}"."${table_name}" WHERE "${pk_field}" = $1`,
        [id]
      )

      log('Deleted %d records', result.rowCount)
      return { deleted: result.rowCount }
    },

    /**
     * Count records matching filter
     */
    async count(filter) {
      log('Counting records in %s.%s', schema_name, table_name)

      const { clause: where_clause, params } = build_where_clause(
        filter,
        database_entity
      )

      const result = await pool.query(
        `SELECT COUNT(*) as count FROM "${schema_name}"."${table_name}" ${where_clause}`,
        params
      )

      const count = parseInt(result.rows[0]?.count || 0, 10)

      log('Count: %d', count)
      return count
    },

    /**
     * Close adapter and connection pool
     */
    async close() {
      log('Closing PostgreSQL adapter')
      await pool.end()
      log('Connection pool closed')
    }
  }
}

export default { create_postgres_adapter }
