/**
 * Get Database Entity
 *
 * Retrieves database entities by name or base_uri.
 */

import debug from 'debug'
import path from 'path'
import { readdir } from 'fs/promises'

import {
  execute_duckdb_query,
  is_duckdb_initialized
} from '../embedded-database-index/duckdb/duckdb-database-client.mjs'
import { read_entity_from_filesystem } from '../entity/filesystem/index.mjs'
import { resolve_base_uri } from '../base-uri/base-uri-utilities.mjs'
import { get_user_base_directory } from '../base-uri/base-directory-registry.mjs'

const log = debug('database:get-entity')

/**
 * Get a database entity by name or base_uri
 *
 * @param {Object} options
 * @param {string} [options.name] - Table name to look up
 * @param {string} [options.base_uri] - Full base_uri of the database entity
 * @returns {Promise<Object|null>} Database entity or null if not found
 */
export async function get_database_entity({ name, base_uri }) {
  if (!name && !base_uri) {
    throw new Error('Either name or base_uri must be provided')
  }

  log('Getting database entity: %s', name || base_uri)

  // If base_uri provided, read directly from filesystem
  if (base_uri) {
    try {
      const absolute_path = resolve_base_uri(base_uri)
      if (!absolute_path) {
        log('Could not resolve base_uri: %s', base_uri)
        return null
      }
      const result = await read_entity_from_filesystem({
        absolute_path
      })
      // read_entity_from_filesystem returns { success, entity_properties, entity_content }
      const entity = result?.entity_properties
      if (entity && entity.type === 'database') {
        return entity
      }
      return null
    } catch (error) {
      log('Error reading database entity: %s', error.message)
      return null
    }
  }

  // If name provided, search by table_name in DuckDB index
  if (is_duckdb_initialized()) {
    try {
      const results = await execute_duckdb_query({
        query: `
          SELECT base_uri, frontmatter
          FROM entities
          WHERE type = 'database'
            AND (frontmatter->>'table_name' = ? OR title = ?)
          LIMIT 1
        `,
        parameters: [name, name]
      })

      if (results.length > 0) {
        const { base_uri: found_uri } = results[0]
        const absolute_path = resolve_base_uri(found_uri)
        if (!absolute_path) {
          log('Could not resolve found base_uri: %s', found_uri)
          return null
        }

        const result = await read_entity_from_filesystem({
          absolute_path
        })
        return result?.entity_properties
      }

      log('No database found with name: %s', name)
      return null
    } catch (error) {
      log('Error searching for database entity: %s', error.message)
      throw error
    }
  }

  // Fallback: scan database/ directory on filesystem when DuckDB index is unavailable
  log('DuckDB not available, falling back to filesystem scan for: %s', name)
  return _find_database_entity_on_filesystem(name)
}

/**
 * Filesystem fallback: scan database/ directory for a database entity by table_name or title
 */
async function _find_database_entity_on_filesystem(name) {
  const user_base = get_user_base_directory()
  if (!user_base) {
    log('No user base directory configured')
    return null
  }

  const database_dir = path.join(user_base, 'database')
  let files
  try {
    files = await readdir(database_dir)
  } catch {
    log('Could not read database directory: %s', database_dir)
    return null
  }

  for (const file of files) {
    if (!file.endsWith('.md') || file === 'ABOUT.md') continue

    const absolute_path = path.join(database_dir, file)
    try {
      const result = await read_entity_from_filesystem({ absolute_path })
      const entity = result?.entity_properties
      if (
        entity &&
        entity.type === 'database' &&
        (entity.table_name === name || entity.title === name)
      ) {
        return entity
      }
    } catch {
      // skip unreadable files
    }
  }

  log('No database found on filesystem with name: %s', name)
  return null
}

/**
 * List all database entities
 *
 * @param {Object} options
 * @param {number} [options.limit=100] - Maximum number to return
 * @param {number} [options.offset=0] - Offset for pagination
 * @returns {Promise<Array<Object>>} Array of database entities
 */
export async function list_database_entities({ limit = 100, offset = 0 } = {}) {
  log('Listing database entities')

  if (!is_duckdb_initialized()) {
    log('DuckDB not initialized')
    throw new Error('DuckDB not initialized')
  }

  try {
    const results = await execute_duckdb_query({
      query: `
        SELECT
          base_uri,
          title,
          description,
          frontmatter->>'table_name' as table_name,
          frontmatter->'storage_config'->>'backend' as backend
        FROM entities
        WHERE type = 'database'
        ORDER BY title ASC
        LIMIT ? OFFSET ?
      `,
      parameters: [limit, offset]
    })

    log('Found %d database entities', results.length)
    return results
  } catch (error) {
    log('Error listing database entities: %s', error.message)
    throw error
  }
}

export default {
  get_database_entity,
  list_database_entities
}
