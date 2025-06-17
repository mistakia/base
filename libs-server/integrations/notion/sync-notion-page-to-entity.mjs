/**
 * Sync Notion page/database item to local entity
 */

import debug from 'debug'
import { get_notion_page_with_blocks } from './notion-api/index.mjs'
import { normalize_notion_page } from './normalize-notion-page.mjs'
import { normalize_notion_database_item } from './normalize-notion-database-item.mjs'
import {
  get_entity_type_for_database,
  get_entity_mapping_config
} from './notion-entity-mapper.mjs'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/index.mjs'
import { save_import_data } from '#libs-server/sync/index.mjs'

const log = debug('integrations:notion:sync-page-to-entity')

/**
 * Find existing entity by external_id
 * @param {string} external_id - The external ID to search for
 * @returns {Object|null} Existing entity or null
 */
async function find_entity_by_external_id(external_id) {
  try {
    // This is a simplified implementation
    // In a full implementation, you'd search the database or filesystem
    // For now, we'll return null to always create new entities
    log(`Searching for entity with external_id: ${external_id}`)
    return null
  } catch (error) {
    log(`Error searching for entity: ${error.message}`)
    return null
  }
}

/**
 * Generate entity file path based on type and name
 * @param {Object} entity - Entity object
 * @returns {string} File path for the entity
 */
function generate_entity_file_path(entity) {
  // Convert name to filename-safe format
  const safe_name = entity.name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Remove multiple consecutive hyphens
    .replace(/^-|-$/g, '') // Remove leading/trailing hyphens

  // Use entity type for directory
  const directory = entity.type.replace('_', '-')

  return `${directory}/${safe_name}.md`
}

/**
 * Sync a Notion page to a local entity
 * @param {string} page_id - Notion page ID
 * @param {string} database_id - Database ID (null for standalone pages)
 * @param {Object} options - Sync options
 * @returns {Object} Sync result
 */
export async function sync_notion_page_to_entity(page_id, database_id = null, options = {}) {
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
        throw new Error(`No entity type mapping found for database: ${database_id}`)
      }

      const mapping_config = get_entity_mapping_config(entity_type)
      normalized_entity = normalize_notion_database_item(notion_page, mapping_config, database_id)
    } else {
      // This is a standalone page
      external_id = `notion:page:${page_id}`
      normalized_entity = normalize_notion_page(notion_page)
    }

    // Check if entity already exists
    const existing_entity = await find_entity_by_external_id(external_id)

    let sync_result
    if (existing_entity) {
      // Update existing entity
      log(`Updating existing entity: ${existing_entity.entity_id}`)

      // Merge updates while preserving entity_id and other local fields
      const updated_entity = {
        ...existing_entity,
        ...normalized_entity,
        entity_id: existing_entity.entity_id, // Preserve original ID
        updated_at: new Date().toISOString()
      }

      // Write updated entity to filesystem
      const file_path = generate_entity_file_path(updated_entity)
      await write_entity_to_filesystem(updated_entity, file_path)

      sync_result = {
        action: 'updated',
        entity_id: updated_entity.entity_id,
        entity_type: updated_entity.type,
        file_path,
        changes: options.track_changes ? get_entity_changes(existing_entity, updated_entity) : null
      }
    } else {
      // Create new entity
      log(`Creating new entity from Notion page: ${page_id}`)

      // Write new entity to filesystem
      const file_path = generate_entity_file_path(normalized_entity)
      await write_entity_to_filesystem(normalized_entity, file_path)

      sync_result = {
        action: 'created',
        entity_id: normalized_entity.entity_id,
        entity_type: normalized_entity.type,
        file_path
      }
    }

    // Save import history for tracking
    await save_import_data('notion', {
      source_id: page_id,
      source_type: database_id ? 'database_item' : 'page',
      database_id,
      entity_id: sync_result.entity_id,
      sync_timestamp: new Date().toISOString(),
      sync_result
    })

    log(`Successfully synced Notion page to entity: ${sync_result.action} ${sync_result.entity_type}`)
    return sync_result
  } catch (error) {
    log(`Failed to sync Notion page to entity: ${error.message}`)
    throw new Error(`Failed to sync Notion page to entity: ${error.message}`)
  }
}

/**
 * Get changes between two entity objects (simplified)
 * @param {Object} old_entity - Original entity
 * @param {Object} new_entity - Updated entity
 * @returns {Object} Changes object
 */
function get_entity_changes(old_entity, new_entity) {
  const changes = {}

  const fields_to_check = ['name', 'content', 'description']
  for (const field of fields_to_check) {
    if (old_entity[field] !== new_entity[field]) {
      changes[field] = {
        old: old_entity[field],
        new: new_entity[field]
      }
    }
  }

  return Object.keys(changes).length > 0 ? changes : null
}
