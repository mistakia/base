import debug from 'debug'

import { resolve_base_uri } from '#libs-server/base-uri/base-uri-utilities.mjs'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import { execute_sqlite_query } from '#libs-server/embedded-database-index/sqlite/sqlite-database-client.mjs'

const log = debug('resolve-entity-by-base-uri')

/**
 * Resolve an entity by its base_uri, falling back to the `entity_aliases` table
 * when the primary path does not exist. Used by callers that accept a base_uri
 * from external input (rendered wikilinks, route handlers) so that stale
 * references continue to resolve to the entity's current path.
 *
 * @param {Object} options
 * @param {string} options.base_uri
 * @returns {Promise<Object>} Augmented read result with `resolved_via`
 *   ("primary" | "alias") and `resolved_base_uri` (the current path when an
 *   alias was followed).
 */
export async function resolve_entity_by_base_uri({ base_uri } = {}) {
  if (!base_uri) {
    return { success: false, error: 'base_uri is required' }
  }

  const primary_absolute_path = resolve_base_uri(base_uri)
  if (primary_absolute_path) {
    const primary_result = await read_entity_from_filesystem({
      absolute_path: primary_absolute_path
    })
    if (primary_result.success) {
      return {
        ...primary_result,
        resolved_via: 'primary',
        resolved_base_uri: base_uri
      }
    }
  }

  // Primary miss: try alias fallback
  try {
    const rows = await execute_sqlite_query({
      query:
        'SELECT current_base_uri FROM entity_aliases WHERE alias_base_uri = ? LIMIT 1',
      parameters: [base_uri]
    })
    const current_base_uri = rows?.[0]?.current_base_uri
    if (!current_base_uri) {
      return {
        success: false,
        error: `Entity not found for base_uri: ${base_uri}`
      }
    }

    const alias_absolute_path = resolve_base_uri(current_base_uri)
    if (!alias_absolute_path) {
      return {
        success: false,
        error: `Alias current_base_uri does not resolve: ${current_base_uri}`
      }
    }

    const alias_result = await read_entity_from_filesystem({
      absolute_path: alias_absolute_path
    })
    if (!alias_result.success) {
      return alias_result
    }

    log(`Resolved ${base_uri} via alias → ${current_base_uri}`)
    return {
      ...alias_result,
      resolved_via: 'alias',
      resolved_base_uri: current_base_uri
    }
  } catch (error) {
    log(`Alias fallback query failed for %s: %s`, base_uri, error.message)
    return {
      success: false,
      error: error.message
    }
  }
}

export default resolve_entity_by_base_uri
