/**
 * File Index Operations
 *
 * Provides database operations for the files index.
 * Uses the files database entity for storage.
 */

import debug from 'debug'

import { get_database_entity } from '#libs-server/database/index.mjs'
import { get_storage_adapter } from '#libs-server/database/storage-adapters/index.mjs'

const log = debug('files:index')

const FILES_DATABASE_BASE_URI = 'user:database/files.md'

let files_adapter = null
let files_database_entity = null

/**
 * Get the files database adapter (lazy initialization)
 * @returns {Promise<Object>} Storage adapter for files database
 */
async function get_files_adapter() {
  if (files_adapter) {
    return files_adapter
  }

  log('Initializing files database adapter')

  // Use base_uri to read directly from filesystem (no DuckDB lookup required)
  files_database_entity = await get_database_entity({
    base_uri: FILES_DATABASE_BASE_URI
  })

  if (!files_database_entity) {
    throw new Error(
      `Files database entity not found at ${FILES_DATABASE_BASE_URI}. Create database/files.md first.`
    )
  }

  files_adapter = await get_storage_adapter(files_database_entity)

  // Ensure table exists
  await files_adapter.create_table()

  log('Files database adapter initialized')
  return files_adapter
}

/**
 * Insert a file record into the index
 *
 * @param {Object} file_record - File record to insert
 * @param {string} file_record.cid - Content identifier (required, primary key)
 * @param {string} file_record.path - Storage path relative to user-base (required)
 * @param {string} [file_record.original_name] - Original filename when stored
 * @param {string} [file_record.mime_type] - MIME type
 * @param {number} [file_record.size] - File size in bytes
 * @param {string|Date} [file_record.created_at] - Storage timestamp
 * @param {string} [file_record.source_uri] - Where the file came from
 * @param {string} [file_record.custom_hash] - Domain-specific hash value
 * @param {string} [file_record.hash_type] - Type of custom hash
 * @param {string} [file_record.context] - Storage context
 * @returns {Promise<Object>} Insert result
 */
export async function insert_file_record(file_record) {
  const adapter = await get_files_adapter()

  log('Inserting file record: %s', file_record.cid)

  // Normalize created_at to ISO string if Date provided
  const normalized_record = {
    ...file_record,
    created_at:
      file_record.created_at instanceof Date
        ? file_record.created_at.toISOString()
        : file_record.created_at || new Date().toISOString()
  }

  const result = await adapter.insert(normalized_record)
  log('File record inserted: %s', file_record.cid)

  return result
}

/**
 * Check if a file exists in the index by CID
 *
 * @param {string} cid - Content identifier to check
 * @returns {Promise<boolean>} True if file exists
 */
export async function file_exists_by_cid(cid) {
  const adapter = await get_files_adapter()

  log('Checking if file exists: %s', cid)

  const count = await adapter.count({ cid })
  const exists = count > 0

  log('File exists check: %s = %s', cid, exists)
  return exists
}

/**
 * Get a file record by CID
 *
 * @param {string} cid - Content identifier
 * @returns {Promise<Object|null>} File record or null if not found
 */
export async function get_file_by_cid(cid) {
  const adapter = await get_files_adapter()

  log('Getting file by CID: %s', cid)

  const results = await adapter.query({
    filter: { cid },
    limit: 1
  })

  const file_record = results.length > 0 ? results[0] : null
  log('File lookup result: %s', file_record ? 'found' : 'not found')

  return file_record
}

/**
 * Query file records with filtering
 *
 * @param {Object} options - Query options
 * @param {Object|string|Array} [options.filter] - Filter criteria
 * @param {string} [options.sort] - Sort field (prefix with - for descending)
 * @param {number} [options.limit=100] - Max results
 * @param {number} [options.offset=0] - Offset for pagination
 * @returns {Promise<Array>} Array of file records
 */
export async function query_files({ filter, sort, limit = 100, offset = 0 } = {}) {
  const adapter = await get_files_adapter()

  log('Querying files with filter: %o', filter)

  const results = await adapter.query({ filter, sort, limit, offset })
  log('Found %d files', results.length)

  return results
}

/**
 * Find files by custom hash (for deduplication)
 *
 * @param {string} custom_hash - Custom hash value to search for
 * @returns {Promise<Array>} Array of file records with matching custom hash
 */
export async function find_files_by_custom_hash(custom_hash) {
  const adapter = await get_files_adapter()

  log('Finding files by custom hash: %s', custom_hash)

  const results = await adapter.query({
    filter: { custom_hash },
    limit: 1000
  })

  log('Found %d files with custom hash', results.length)
  return results
}

/**
 * Find files by context
 *
 * @param {string} context - Storage context (e.g., 'notion', 'music')
 * @param {Object} [options] - Query options
 * @param {number} [options.limit=100] - Max results
 * @param {number} [options.offset=0] - Offset for pagination
 * @returns {Promise<Array>} Array of file records
 */
export async function find_files_by_context(
  context,
  { limit = 100, offset = 0 } = {}
) {
  const adapter = await get_files_adapter()

  log('Finding files by context: %s', context)

  const results = await adapter.query({
    filter: { context },
    limit,
    offset
  })

  log('Found %d files with context %s', results.length, context)
  return results
}

/**
 * Count files in the index
 *
 * @param {Object|string|Array} [filter] - Optional filter criteria
 * @returns {Promise<number>} Count of files
 */
export async function count_files(filter) {
  const adapter = await get_files_adapter()

  log('Counting files with filter: %o', filter)

  const count = await adapter.count(filter)
  log('File count: %d', count)

  return count
}

/**
 * Delete a file record by CID
 * Note: This only removes the index entry, not the actual file
 *
 * @param {string} cid - Content identifier
 * @returns {Promise<Object>} Delete result
 */
export async function delete_file_record(cid) {
  const adapter = await get_files_adapter()

  log('Deleting file record: %s', cid)

  const result = await adapter.delete(cid)
  log('File record deleted: %s', cid)

  return result
}

/**
 * Close the files adapter connection
 */
export async function close_files_adapter() {
  if (files_adapter) {
    log('Closing files adapter')
    await files_adapter.close()
    files_adapter = null
    files_database_entity = null
  }
}
