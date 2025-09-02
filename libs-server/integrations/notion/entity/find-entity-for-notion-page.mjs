/**
 * Find matching entity for Notion page - no fuzzy matching, exact matches only
 */

import debug from 'debug'
import fs from 'fs/promises'
import path from 'path'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/index.mjs'
import { resolve_base_uri_from_registry } from '#libs-server/base-uri/index.mjs'
import { title_to_safe_filename } from '#libs-server/utils/sanitize-filename.mjs'
import { lookup_entity, cache_entity } from '../cache/notion-entity-cache.mjs'
import config from '#config'

const log = debug('integrations:notion:entity:find')

/**
 * Generate expected entity paths based on normalized entity data
 * @param {Object} normalized_entity - Normalized entity object
 * @returns {Object} Object with base_uri and absolute_path
 */
function get_expected_entity_paths(normalized_entity) {
  const safe_name = title_to_safe_filename(
    normalized_entity.name || normalized_entity.title
  )
  const directory = normalized_entity.type.replace(/_/g, '-')
  const base_uri = `user:${directory}/${safe_name}.md`
  const absolute_path = resolve_base_uri_from_registry(base_uri)

  return { base_uri, absolute_path }
}

/**
 * Verify cached entity still exists and matches external_id
 * @param {string} base_uri - Base URI from cache
 * @param {string} target_external_id - External ID to verify
 * @returns {Promise<Object|null>} Entity data if valid, null if stale
 */
async function verify_cached_entity(base_uri, target_external_id) {
  try {
    const absolute_path = resolve_base_uri_from_registry(base_uri)
    const entity = await check_file_for_external_id(
      absolute_path,
      target_external_id
    )

    if (entity) {
      log(`Cache entry verified: ${base_uri} -> ${absolute_path}`)
      return entity
    } else {
      log(
        `Cache entry stale: ${base_uri} (file not found or external_id mismatch)`
      )
      return null
    }
  } catch (error) {
    log(`Cache verification failed for ${base_uri}: ${error.message}`)
    return null
  }
}

/**
 * Check if a file has the matching external_id
 * @param {string} file_path - Absolute path to file
 * @param {string} target_external_id - External ID to match
 * @returns {Promise<Object|null>} Entity data if match found, null otherwise
 */
async function check_file_for_external_id(file_path, target_external_id) {
  try {
    const result = await read_entity_from_filesystem({
      absolute_path: file_path
    })

    if (
      result.success &&
      result.entity_properties.external_id === target_external_id
    ) {
      return {
        ...result.entity_properties,
        content: result.entity_content,
        absolute_path: file_path
      }
    }

    return null
  } catch (error) {
    // Skip files that can't be read or parsed
    return null
  }
}

/**
 * Search all files in a directory for matching external_id
 * @param {string} directory_path - Directory to search
 * @param {string} target_external_id - External ID to match
 * @returns {Promise<Object|null>} Entity data if found, null otherwise
 */
async function search_directory_for_external_id(
  directory_path,
  target_external_id
) {
  try {
    // Check if directory exists
    try {
      await fs.access(directory_path)
    } catch (error) {
      return null
    }

    const files = await fs.readdir(directory_path)
    const markdown_files = files.filter((file) => file.endsWith('.md'))

    for (const file of markdown_files) {
      const file_path = path.join(directory_path, file)
      const entity = await check_file_for_external_id(
        file_path,
        target_external_id
      )

      if (entity) {
        log(`Found entity with external_id in ${file_path}`)
        return entity
      }
    }

    return null
  } catch (error) {
    return null
  }
}

/**
 * Full scan across all entity directories for matching external_id (last resort)
 * @param {string} target_external_id - External ID to match
 * @returns {Promise<Object|null>} Entity data if found, null otherwise
 */
async function full_scan_for_external_id(target_external_id) {
  const user_base_directory = config.user_base_directory

  if (!user_base_directory) {
    return null
  }

  // Common entity type directories to search
  const entity_directories = [
    'text',
    'task',
    'workflow',
    'physical-item',
    'physical-location',
    'guideline'
  ]

  log(`Starting full scan for external_id: ${target_external_id}`)

  for (const dir_name of entity_directories) {
    const directory_path = path.join(user_base_directory, dir_name)
    const entity = await search_directory_for_external_id(
      directory_path,
      target_external_id
    )

    if (entity) {
      log(`Found entity via full scan in ${dir_name}/ directory`)
      return entity
    }
  }

  return null
}

/**
 * Find entity by exact name matching at expected location
 * @param {string} name - Name to search for
 * @param {string} entity_type - Entity type
 * @returns {Promise<Object|null>} Entity data if found, null otherwise
 */
async function find_entity_by_exact_name(name, entity_type) {
  try {
    log(`Searching for entity by exact name: ${name} (type: ${entity_type})`)

    // Generate expected path based on name and type
    const safe_name = title_to_safe_filename(name)
    const directory = entity_type.replace(/_/g, '-')
    const base_uri = `user:${directory}/${safe_name}.md`
    const absolute_path = resolve_base_uri_from_registry(base_uri)

    log(`Checking expected path for exact name: ${absolute_path}`)

    try {
      const result = await read_entity_from_filesystem({ absolute_path })

      if (result.success) {
        const entity = {
          ...result.entity_properties,
          content: result.entity_content,
          absolute_path
        }

        // Check if names match exactly
        if (entity.name === name || entity.title === name) {
          log(
            `Found entity by exact name at expected location: ${absolute_path}`
          )
          return entity
        }
      }
    } catch (error) {
      // Expected path not found, which is normal
    }

    return null
  } catch (error) {
    log(`Error searching for entity by exact name: ${error.message}`)
    return null
  }
}

/**
 * Find entity for Notion page using a four-tier exact matching strategy
 *
 * This function implements a graduated search approach that prioritizes performance
 * while ensuring comprehensive coverage. The search strategies are:
 *
 * 0. **Cache Lookup**: Fastest - checks the TSV cache for external_id to base_uri mapping.
 *    If found, verifies the cached path still exists and matches the external_id.
 *
 * 1. **Expected Location Search**: Fast - checks the exact path where we expect
 *    the entity to be based on its title and type. This works when entities follow
 *    standard naming conventions and haven't been moved.
 *
 * 2. **Entity Type Directory Search**: Medium speed - scans all files within the
 *    appropriate entity type directory (e.g., all files in physical-item/). This
 *    handles cases where the entity exists but with a different filename than expected.
 *
 * 3. **Full Filesystem Scan**: Slowest - searches across all entity directories.
 *    This is the fallback when entities have been moved to unexpected locations or
 *    when the entity type mapping is incorrect.
 *
 * Each strategy only searches for exact external_id matches - no fuzzy matching is
 * performed to prevent data corruption from incorrect entity associations.
 *
 * When an entity is found via strategies 1-3, it is automatically cached for future lookups.
 *
 * @param {string} external_id - Notion external ID (e.g., "notion:page:abc123")
 * @param {Object} normalized_entity - Normalized entity data from Notion
 * @returns {Promise<Object|null>} Entity data if found, null otherwise
 */
export async function find_entity_for_notion_page(
  external_id,
  normalized_entity
) {
  try {
    log(`Finding entity for Notion external_id: ${external_id}`)

    if (!external_id) {
      throw new Error('Missing required parameter: external_id')
    }

    if (!normalized_entity) {
      throw new Error('Missing required parameter: normalized_entity')
    }

    // Strategy 0: Check cache first for external_id to base_uri mapping
    // This is the fastest approach for previously found entities
    log(`Strategy 0 - Checking cache for external_id: ${external_id}`)

    const cached_base_uri = await lookup_entity(external_id)
    if (cached_base_uri) {
      const cached_entity = await verify_cached_entity(
        cached_base_uri,
        external_id
      )
      if (cached_entity) {
        log('Found entity via cache lookup (Strategy 0 success)')
        return cached_entity
      }
      // Cache entry was stale, continue with other strategies
    }

    // Strategy 1: Check expected location based on title/name
    // This is the second fastest approach and works for entities that follow standard naming
    const expected_paths = get_expected_entity_paths(normalized_entity)
    log(
      `Strategy 1 - Checking expected location: ${expected_paths.absolute_path}`
    )

    const expected_entity = await check_file_for_external_id(
      expected_paths.absolute_path,
      external_id
    )
    if (expected_entity) {
      log('Found entity at expected location (Strategy 1 success)')
      // Cache the successful lookup for future reference
      await cache_entity(external_id, expected_paths.base_uri)
      return expected_entity
    }

    // Strategy 2: Search within the expected entity type directory
    // This handles cases where the entity exists but with a different filename
    const entity_type_directory = path.dirname(expected_paths.absolute_path)
    log(
      `Strategy 2 - Searching entity type directory: ${entity_type_directory}`
    )

    const directory_entity = await search_directory_for_external_id(
      entity_type_directory,
      external_id
    )
    if (directory_entity) {
      log(
        `Found entity in type directory (Strategy 2 success): ${entity_type_directory}`
      )
      // Generate base_uri from absolute_path for caching
      const user_base_directory = config.user_base_directory
      if (
        user_base_directory &&
        directory_entity.absolute_path.startsWith(user_base_directory)
      ) {
        const relative_path = path.relative(
          user_base_directory,
          directory_entity.absolute_path
        )
        const base_uri = `user:${relative_path}`
        await cache_entity(external_id, base_uri)
      }
      return directory_entity
    }

    // Strategy 3: Full scan across all entity directories (last resort)
    // This is the most comprehensive but slowest approach
    log(
      `Strategy 3 - Performing full filesystem scan for external_id: ${external_id}`
    )

    const scanned_entity = await full_scan_for_external_id(external_id)
    if (scanned_entity) {
      log('Found entity via full scan (Strategy 3 success)')
      // Generate base_uri from absolute_path for caching
      const user_base_directory = config.user_base_directory
      if (
        user_base_directory &&
        scanned_entity.absolute_path.startsWith(user_base_directory)
      ) {
        const relative_path = path.relative(
          user_base_directory,
          scanned_entity.absolute_path
        )
        const base_uri = `user:${relative_path}`
        await cache_entity(external_id, base_uri)
      }
      return scanned_entity
    }

    log(
      `No entity found for external_id: ${external_id} (all strategies exhausted)`
    )
    return null
  } catch (error) {
    log(`Error finding entity for Notion page: ${error.message}`)
    throw error
  }
}

/**
 * Find entity by exact name matching (fallback when no external_id match)
 * @param {string} name - Entity name/title
 * @param {string} entity_type - Entity type
 * @returns {Promise<Object|null>} Entity data if found, null otherwise
 */
export async function find_entity_by_name_filesystem(name, entity_type) {
  return await find_entity_by_exact_name(name, entity_type)
}
