/**
 * Sync Notion page/database item to local entity
 */

import debug from 'debug'
import { get_notion_page_with_blocks } from './notion-api/index.mjs'
import { normalize_notion_page } from './normalize-notion-page.mjs'
import { normalize_notion_database_item } from './normalize-notion-database-item.mjs'
import {
  get_entity_type_for_database,
  get_database_mapping_config
} from './notion-entity-mapper.mjs'
import { update_entity_from_external_item } from '#libs-server/sync/index.mjs'
import { create_entity_from_external_item } from '#libs-server/entity/index.mjs'
import { resolve_base_uri_from_registry } from '#libs-server/base-uri/index.mjs'
import { sanitize_for_filename } from '#libs-server/utils/sanitize-filename.mjs'
import {
  find_entity_for_notion_page,
  find_entity_by_name_filesystem
} from './entity/find-entity-for-notion-page.mjs'

const log = debug('integrations:notion:sync-page-to-entity')

/**
 * Generate entity base URI and resolve to absolute path
 * @param {Object} entity - Entity object
 * @returns {Object} Object with base_uri and absolute_path
 */
function generate_entity_paths(entity) {
  // Convert title to filename-safe format using shared utility
  const safe_name = sanitize_for_filename(
    entity.title || entity.name || 'untitled',
    {
      maxLength: 100,
      fallback: 'untitled'
    }
  )

  // Use entity type for directory - convert underscores to hyphens for consistency
  const directory = entity.type.replace(/_/g, '-')

  // Create base URI following RFC 3986 format with user: scheme
  // Format: user:directory/filename.md
  const base_uri = `user:${directory}/${safe_name}.md`

  // Resolve to absolute path using the registry
  const absolute_path = resolve_base_uri_from_registry(base_uri)

  return { base_uri, absolute_path }
}

/**
 * Sync a Notion page to a local entity
 * @param {string} page_id - Notion page ID
 * @param {string} database_id - Database ID (null for standalone pages)
 * @param {Object} options - Sync options
 * @returns {Object} Sync result
 */
export async function sync_notion_page_to_entity(
  page_id,
  database_id = null,
  options = {}
) {
  try {
    log(`Starting sync for Notion page: ${page_id}`)

    // Get the full page with blocks
    const notion_page = await get_notion_page_with_blocks(page_id)

    let normalized_entity
    let external_id

    if (database_id) {
      // This is a database item
      external_id = `notion:database:${database_id}:${page_id}`

      // Get mapping configuration
      const entity_type = get_entity_type_for_database(database_id)
      if (!entity_type) {
        throw new Error(
          `No entity type mapping found for database: ${database_id}`
        )
      }

      const mapping_config = get_database_mapping_config(database_id)
      normalized_entity = await normalize_notion_database_item(
        notion_page,
        mapping_config,
        database_id,
        options
      )
    } else {
      // This is a standalone page
      external_id = `notion:page:${page_id}`
      normalized_entity = await normalize_notion_page(notion_page, options)
    }

    // Check if entity already exists by external_id using filesystem search
    let existing_entity = await find_entity_for_notion_page(
      external_id,
      normalized_entity
    )

    // If not found by external_id, try searching by name/title as fallback
    if (!existing_entity) {
      existing_entity = await find_entity_by_name_filesystem(
        normalized_entity.name || normalized_entity.title,
        normalized_entity.type
      )

      if (existing_entity) {
        log(
          `Found existing entity by name match, will update external_id: ${existing_entity.entity_id}`
        )
        // Update the entity to include the external_id for future syncs
        existing_entity.external_id = external_id
      }
    }

    let sync_result
    if (existing_entity) {
      // Update existing entity using shared function
      log(`Updating existing entity: ${existing_entity.entity_id}`)

      // Generate new paths for the updated entity
      const { base_uri, absolute_path } = generate_entity_paths({
        ...normalized_entity,
        entity_id: existing_entity.entity_id
      })

      // Check if the file path has changed (e.g., due to title change)
      const old_path = existing_entity.absolute_path
      const path_changed = old_path && old_path !== absolute_path

      if (path_changed) {
        log(`Entity path changed from ${old_path} to ${absolute_path}`)

        // If path changed, delete the old file first
        try {
          const { unlink } = await import('fs/promises')
          await unlink(old_path)
          log(`Deleted old entity file: ${old_path}`)
        } catch (error) {
          log(
            `Warning: Could not delete old entity file ${old_path}: ${error.message}`
          )
        }
      }

      // Add the existing entity_id to the normalized entity properties
      const entity_properties_with_id = {
        ...normalized_entity,
        entity_id: existing_entity.entity_id
      }

      // Use the shared update function
      const update_result = await update_entity_from_external_item({
        external_item: notion_page,
        entity_properties: entity_properties_with_id,
        entity_type: normalized_entity.type,
        external_system: 'notion',
        external_id,
        absolute_path,
        external_update_time: notion_page.last_edited_time,
        import_history_base_directory: options.import_history_base_directory,
        force: options.force || false
      })

      sync_result = {
        ...update_result,
        entity_type: normalized_entity.type,
        file_path: absolute_path,
        base_uri,
        old_path: path_changed ? old_path : null,
        path_changed
      }
    } else {
      // Create new entity using shared function
      log(`Creating new entity from Notion page: ${page_id}`)

      // Generate paths for the new entity
      const { base_uri, absolute_path } =
        generate_entity_paths(normalized_entity)

      // Use the shared create function
      const create_result = await create_entity_from_external_item({
        external_item: notion_page,
        entity_properties: normalized_entity,
        entity_type: normalized_entity.type,
        external_system: 'notion',
        external_id,
        absolute_path,
        user_id: normalized_entity.user_id,
        import_history_base_directory: options.import_history_base_directory
      })

      sync_result = {
        action: 'created',
        entity_id: create_result.entity_id,
        entity_type: normalized_entity.type,
        file_path: absolute_path,
        base_uri
      }
    }

    // Import history is now handled by the shared create/update functions

    log(
      `Successfully synced Notion page to entity: ${sync_result.action} ${sync_result.entity_type}`
    )
    return sync_result
  } catch (error) {
    log(`Failed to sync Notion page to entity: ${error.message}`)
    throw new Error(`Failed to sync Notion page to entity: ${error.message}`)
  }
}

/**
 * Find the base-uri for a child page reference
 * @param {string} title - Child page title
 * @returns {string} Base URI for the child page
 */
export async function find_child_page_base_uri(title) {
  try {
    // First try to find an existing entity with this title using filesystem search
    const existing_entity = await find_entity_by_name_filesystem(title, 'text')

    if (existing_entity && existing_entity.base_uri) {
      log(
        `Found existing entity for child page "${title}": ${existing_entity.base_uri}`
      )
      return existing_entity.base_uri
    }

    // If not found, generate the expected base-uri format using shared sanitization
    const safe_name = sanitize_for_filename(title, {
      maxLength: 100,
      fallback: 'untitled'
    })

    const expected_base_uri = `user:text/${safe_name}.md`
    log(
      `Generated expected base-uri for child page "${title}": ${expected_base_uri}`
    )
    return expected_base_uri
  } catch (error) {
    log(`Error finding child page base-uri for "${title}": ${error.message}`)
    // Fallback to generated format using shared sanitization
    const safe_name = sanitize_for_filename(title, {
      maxLength: 100,
      fallback: 'untitled'
    })

    return `user:text/${safe_name}.md`
  }
}
