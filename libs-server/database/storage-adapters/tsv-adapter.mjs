/**
 * TSV Storage Adapter
 *
 * Provides storage backend using tab-separated values files.
 * Simple file-based storage for smaller datasets.
 *
 * LIMITATIONS:
 * - Best for datasets under 1,000 records
 * - Insert/update/delete operations read and rewrite the entire file
 * - Not suitable for high-frequency writes or large datasets
 * - For larger datasets, use DuckDB (embedded) or PostgreSQL (external)
 */

import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'

import config from '../../../config/index.mjs'
import { apply_filter, apply_sort } from './file-adapter-utils.mjs'

const log = debug('database:adapter:tsv')

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
 * Serialize records to TSV content
 */
function serialize_tsv(records, fields) {
  if (records.length === 0) {
    return fields.map((f) => f.name).join('\t') + '\n'
  }

  const field_names = fields.map((f) => f.name)
  const header = field_names.join('\t')

  const lines = records.map((record) => {
    return field_names
      .map((name) => {
        const value = record[name]
        if (value === null || value === undefined) {
          return ''
        }
        if (typeof value === 'object') {
          return JSON.stringify(value)
        }
        return String(value).replace(/\t/g, ' ').replace(/\n/g, ' ')
      })
      .join('\t')
  })

  return header + '\n' + lines.join('\n') + '\n'
}

/**
 * Get file path from database entity
 */
function get_file_path(database_entity) {
  const storage_config = database_entity.storage_config || {}
  const relative_path = storage_config.path

  if (!relative_path) {
    throw new Error('TSV adapter requires storage_config.path')
  }

  // Resolve relative to user-base directory
  const user_base = config.user_base_directory
  return path.resolve(user_base, relative_path)
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
 * Create TSV adapter for a database entity
 */
export function create_tsv_adapter(database_entity) {
  const file_path = get_file_path(database_entity)
  const fields = database_entity.fields || []
  const pk_field = get_primary_key_field(database_entity)

  log('Creating TSV adapter for file: %s', file_path)

  return {
    /**
     * Create or sync table (creates file with header if not exists)
     */
    async create_table() {
      log('Creating TSV file: %s', file_path)

      try {
        await fs.access(file_path)
        log('TSV file already exists')
      } catch {
        // File doesn't exist, create with header
        await fs.mkdir(path.dirname(file_path), { recursive: true })
        const header = fields.map((f) => f.name).join('\t') + '\n'
        await fs.writeFile(file_path, header, 'utf-8')
        log('TSV file created with header')
      }
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

      log('Inserting %d records into %s', records.length, file_path)

      // Read existing records
      let existing = []
      try {
        const content = await fs.readFile(file_path, 'utf-8')
        existing = parse_tsv(content, fields)
      } catch {
        // File doesn't exist, will create
      }

      // Add new records
      const all_records = [...existing, ...records]

      // Write back
      const content = serialize_tsv(all_records, fields)
      await fs.writeFile(file_path, content, 'utf-8')

      log('Inserted %d records', records.length)
      return { inserted: records.length }
    },

    /**
     * Query records
     */
    async query({ filter, sort, limit = 1000, offset = 0 } = {}) {
      log('Querying TSV file: %s', file_path)

      let content
      try {
        content = await fs.readFile(file_path, 'utf-8')
      } catch {
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

      log('Updating record %s in %s', id, file_path)

      const content = await fs.readFile(file_path, 'utf-8')
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
        await fs.writeFile(file_path, new_content, 'utf-8')
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

      log('Deleting record %s from %s', id, file_path)

      const content = await fs.readFile(file_path, 'utf-8')
      const records = parse_tsv(content, fields)
      const filtered = records.filter(
        (record) => String(record[pk_field]) !== String(id)
      )

      const deleted = records.length - filtered.length

      if (deleted > 0) {
        const new_content = serialize_tsv(filtered, fields)
        await fs.writeFile(file_path, new_content, 'utf-8')
      }

      log('Deleted %d records', deleted)
      return { deleted }
    },

    /**
     * Count records matching filter
     */
    async count(filter) {
      log('Counting records in %s', file_path)

      let content
      try {
        content = await fs.readFile(file_path, 'utf-8')
      } catch {
        return 0
      }

      let records = parse_tsv(content, fields)
      records = apply_filter(records, filter)

      log('Count: %d', records.length)
      return records.length
    },

    /**
     * Close adapter (no-op for file-based)
     */
    async close() {
      log('TSV adapter closed')
    }
  }
}

export default { create_tsv_adapter }
