/**
 * Remote TSV Storage Adapter
 *
 * Reads and writes TSV files on remote hosts via SSH.
 * Transfers file content and performs filtering/sorting locally.
 *
 * LIMITATIONS:
 * - Best for datasets under 1,000 records (entire file is transferred)
 * - For larger datasets, use DuckDB or PostgreSQL backends
 */

import debug from 'debug'

import { apply_filter, apply_sort } from './file-adapter-utils.mjs'
import {
  execute_ssh,
  write_remote_file,
  escape_shell_arg
} from './ssh-utils.mjs'

const log = debug('database:adapter:tsv-remote')

/**
 * Parse TSV content into records
 */
function parse_tsv(content, fields) {
  const lines = content.split('\n').filter((line) => line.trim())
  if (lines.length === 0) {
    return []
  }

  // First line is header
  const header = lines[0].split('\t')
  const records = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split('\t')
    const record = {}

    for (let j = 0; j < header.length; j++) {
      const field_name = header[j]
      const field_def = fields.find((f) => f.name === field_name)
      let value = values[j] || ''

      // Type coercion based on field definition
      if (field_def) {
        switch (field_def.type) {
          case 'number':
            value = value ? parseFloat(value) : null
            break
          case 'boolean':
            value = value.toLowerCase() === 'true'
            break
          case 'array':
          case 'object':
            try {
              value = value ? JSON.parse(value) : null
            } catch {
              value = null
            }
            break
          case 'datetime':
            value = value || null
            break
        }
      }

      record[field_name] = value
    }

    records.push(record)
  }

  return records
}

/**
 * Escape a value for TSV format
 * Removes tabs and newlines to prevent field/row corruption
 */
function escape_tsv_value(value) {
  if (value === null || value === undefined) {
    return ''
  }
  if (typeof value === 'object') {
    // JSON stringify and then escape tabs/newlines
    return JSON.stringify(value).replace(/\t/g, ' ').replace(/\n/g, ' ')
  }
  return String(value).replace(/\t/g, ' ').replace(/\n/g, ' ')
}

/**
 * Serialize records to TSV content
 */
function serialize_tsv(records, fields) {
  const field_names = fields.map((f) => f.name)
  const header = field_names.join('\t')

  if (records.length === 0) {
    return header + '\n'
  }

  const lines = records.map((record) => {
    return field_names.map((name) => escape_tsv_value(record[name])).join('\t')
  })

  return header + '\n' + lines.join('\n') + '\n'
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
 * Create remote TSV adapter
 *
 * @param {Object} options - Adapter options
 * @param {string} options.host - SSH config host alias
 * @param {string} options.file_path - Path to TSV file on remote host
 * @param {Object} options.database_entity - Database entity with schema
 * @returns {Object} Storage adapter instance
 */
export function create_tsv_remote_adapter({
  host,
  file_path,
  database_entity
}) {
  const fields = database_entity.fields || []
  const pk_field = get_primary_key_field(database_entity)

  log('Creating remote TSV adapter: %s:%s', host, file_path)

  /**
   * Read remote file content
   */
  async function read_remote() {
    try {
      const escaped_path = escape_shell_arg(file_path)
      const content = await execute_ssh(host, `cat ${escaped_path}`)
      return content
    } catch (err) {
      // File might not exist yet
      if (err.message.includes('No such file')) {
        return ''
      }
      throw err
    }
  }

  return {
    /**
     * Create file with header on remote
     */
    async create_table() {
      log('Creating remote TSV file: %s:%s', host, file_path)

      // Check if file exists
      const escaped_path = escape_shell_arg(file_path)
      try {
        await execute_ssh(host, `test -f ${escaped_path}`)
        log('Remote TSV file already exists')
        return
      } catch {
        // File doesn't exist, create with header
      }

      // Ensure directory exists
      const dir = file_path.substring(0, file_path.lastIndexOf('/'))
      if (dir) {
        const escaped_dir = escape_shell_arg(dir)
        await execute_ssh(host, `mkdir -p ${escaped_dir}`)
      }

      const header = fields.map((f) => f.name).join('\t') + '\n'
      await write_remote_file(host, file_path, header)
      log('Remote TSV file created with header')
    },

    /**
     * Insert records
     */
    async insert(records) {
      if (!Array.isArray(records)) {
        records = [records]
      }

      if (records.length === 0) {
        return { inserted: 0 }
      }

      log('Inserting %d records into %s:%s', records.length, host, file_path)

      // Read existing content
      const content = await read_remote()
      const existing = content ? parse_tsv(content, fields) : []

      // Add new records
      const all_records = [...existing, ...records]

      // Write back
      const new_content = serialize_tsv(all_records, fields)
      await write_remote_file(host, file_path, new_content)

      log('Inserted %d records', records.length)
      return { inserted: records.length }
    },

    /**
     * Query records
     */
    async query({ filter, sort, limit = 1000, offset = 0 } = {}) {
      log('Querying remote TSV file: %s:%s', host, file_path)

      const content = await read_remote()
      if (!content) {
        return []
      }

      let records = parse_tsv(content, fields)
      records = apply_filter(records, filter)
      records = apply_sort(records, sort)
      records = records.slice(offset, offset + limit)

      log('Found %d records', records.length)
      return records
    },

    /**
     * Update a record by primary key
     */
    async update(id, update_fields) {
      if (!pk_field) {
        throw new Error('No primary key field defined for this database')
      }

      log('Updating record %s in %s:%s', id, host, file_path)

      const content = await read_remote()
      const records = parse_tsv(content, fields)

      let updated = 0
      for (const record of records) {
        if (String(record[pk_field]) === String(id)) {
          Object.assign(record, update_fields)
          updated++
        }
      }

      if (updated > 0) {
        const new_content = serialize_tsv(records, fields)
        await write_remote_file(host, file_path, new_content)
      }

      log('Updated %d records', updated)
      return { updated }
    },

    /**
     * Delete a record by primary key
     */
    async delete(id) {
      if (!pk_field) {
        throw new Error('No primary key field defined for this database')
      }

      log('Deleting record %s from %s:%s', id, host, file_path)

      const content = await read_remote()
      const records = parse_tsv(content, fields)
      const filtered = records.filter(
        (record) => String(record[pk_field]) !== String(id)
      )

      const deleted = records.length - filtered.length

      if (deleted > 0) {
        const new_content = serialize_tsv(filtered, fields)
        await write_remote_file(host, file_path, new_content)
      }

      log('Deleted %d records', deleted)
      return { deleted }
    },

    /**
     * Count records matching filter
     */
    async count(filter) {
      log('Counting records in %s:%s', host, file_path)

      const content = await read_remote()
      if (!content) {
        return 0
      }

      let records = parse_tsv(content, fields)
      records = apply_filter(records, filter)

      log('Count: %d', records.length)
      return records.length
    },

    /**
     * Close adapter (no persistent connection for SSH)
     */
    async close() {
      log('Remote TSV adapter closed')
    }
  }
}

export default { create_tsv_remote_adapter }
