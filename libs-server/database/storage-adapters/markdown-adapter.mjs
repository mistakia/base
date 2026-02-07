/**
 * Markdown Storage Adapter
 *
 * Provides storage backend using markdown files with YAML frontmatter.
 * Each record is stored as a separate markdown file in the configured directory.
 */

import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'
import { v4 as uuidv4 } from 'uuid'

import config from '../../../config/index.mjs'
import {
  read_entity_from_filesystem,
  write_entity_to_filesystem
} from '../../entity/filesystem/index.mjs'
import { apply_filter, apply_sort } from './file-adapter-utils.mjs'

const log = debug('database:adapter:markdown')

/**
 * Get directory path from database entity
 */
function get_directory_path(database_entity) {
  const storage_config = database_entity.storage_config || {}
  const relative_dir = storage_config.directory

  if (!relative_dir) {
    throw new Error('Markdown adapter requires storage_config.directory')
  }

  // Resolve relative to user-base directory
  const user_base = config.user_base_directory
  return path.resolve(user_base, relative_dir)
}

/**
 * Get primary key field name
 */
function get_primary_key_field(database_entity) {
  const fields = database_entity.fields || []
  const pk_field = fields.find((f) => f.primary_key)
  return pk_field?.name || 'entity_id'
}

/**
 * Generate filename from record
 */
function generate_filename(record, pk_field) {
  const id = record[pk_field] || record.entity_id || uuidv4()
  // Sanitize ID for use as filename
  const safe_id = String(id)
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .substring(0, 100)
  return `${safe_id}.md`
}

/**
 * Read all records from directory
 */
async function read_all_records(directory_path, database_entity) {
  const records = []

  try {
    const files = await fs.readdir(directory_path)
    const md_files = files.filter((f) => f.endsWith('.md'))

    for (const file of md_files) {
      const file_path = path.join(directory_path, file)
      try {
        const entity = await read_entity_from_filesystem({
          absolute_path: file_path
        })
        if (entity) {
          records.push(entity)
        }
      } catch (error) {
        log('Error reading file %s: %s', file, error.message)
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error
    }
  }

  return records
}

/**
 * Create markdown adapter for a database entity
 */
export function create_markdown_adapter(database_entity) {
  const directory_path = get_directory_path(database_entity)
  const pk_field = get_primary_key_field(database_entity)
  const table_name = database_entity.table_name

  log('Creating markdown adapter for directory: %s', directory_path)

  return {
    /**
     * Create directory if not exists
     */
    async create_table() {
      log('Creating directory: %s', directory_path)

      await fs.mkdir(directory_path, { recursive: true })

      log('Directory created: %s', directory_path)
    },

    /**
     * Insert records as markdown files
     */
    async insert(records) {
      if (!Array.isArray(records)) {
        records = [records]
      }

      if (records.length === 0) {
        return { inserted: 0 }
      }

      log('Inserting %d records into %s', records.length, directory_path)

      await fs.mkdir(directory_path, { recursive: true })

      let inserted = 0
      for (const record of records) {
        const filename = generate_filename(record, pk_field)
        const file_path = path.join(directory_path, filename)

        // Prepare entity structure
        const entity = {
          ...record,
          entity_id: record.entity_id || uuidv4(),
          type: table_name || 'database_item',
          created_at: record.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString()
        }

        await write_entity_to_filesystem({
          absolute_path: file_path,
          entity
        })

        inserted++
      }

      log('Inserted %d records', inserted)
      return { inserted }
    },

    /**
     * Query records
     */
    async query({ filter, sort, limit = 1000, offset = 0 } = {}) {
      log('Querying directory: %s', directory_path)

      let records = await read_all_records(directory_path, database_entity)
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
      log('Updating record %s in %s', id, directory_path)

      const records = await read_all_records(directory_path, database_entity)
      const record = records.find((r) => String(r[pk_field]) === String(id))

      if (!record) {
        log('Record not found: %s', id)
        return { updated: 0 }
      }

      // Update record
      const updated_record = {
        ...record,
        ...update_fields,
        updated_at: new Date().toISOString()
      }

      const filename = generate_filename(updated_record, pk_field)
      const file_path = path.join(directory_path, filename)

      await write_entity_to_filesystem({
        absolute_path: file_path,
        entity: updated_record
      })

      log('Record updated')
      return { updated: 1 }
    },

    /**
     * Delete a record by primary key
     */
    async delete(id) {
      log('Deleting record %s from %s', id, directory_path)

      const records = await read_all_records(directory_path, database_entity)
      const record = records.find((r) => String(r[pk_field]) === String(id))

      if (!record) {
        log('Record not found: %s', id)
        return { deleted: 0 }
      }

      const filename = generate_filename(record, pk_field)
      const file_path = path.join(directory_path, filename)

      try {
        await fs.unlink(file_path)
        log('Record deleted')
        return { deleted: 1 }
      } catch (error) {
        log('Error deleting file: %s', error.message)
        return { deleted: 0 }
      }
    },

    /**
     * Count records matching filter
     */
    async count(filter) {
      log('Counting records in %s', directory_path)

      let records = await read_all_records(directory_path, database_entity)
      records = apply_filter(records, filter)

      log('Count: %d', records.length)
      return records.length
    },

    /**
     * Close adapter (no-op for file-based)
     */
    async close() {
      log('Markdown adapter closed')
    }
  }
}

export default { create_markdown_adapter }
