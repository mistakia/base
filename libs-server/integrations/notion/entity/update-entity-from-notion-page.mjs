/**
 * Update existing entity from Notion page
 */

import debug from 'debug'
import { normalize_notion_page } from '../normalize-notion-page.mjs'
import { normalize_notion_database_item } from '../normalize-notion-database-item.mjs'
import {
  get_entity_type_for_database,
  get_database_mapping_config
} from '../notion-entity-mapper.mjs'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/index.mjs'
import { detect_field_changes } from '#libs-server/sync/index.mjs'
import { format_entity_path_for_notion } from './format-entity-path-for-notion.mjs'

const log = debug('integrations:notion:entity:update')

/**
 * Update an existing entity from a Notion page
 * @param {Object} existing_entity - Existing entity object
 * @param {Object} notion_page - Updated Notion page object with blocks
 * @param {string} database_id - Database ID (null for standalone pages)
 * @param {Object} options - Update options
 * @returns {Object} Update result
 */
export async function update_entity_from_notion_page(
  existing_entity,
  notion_page,
  database_id = null,
  options = {}
) {
  try {
    log(`Updating entity from Notion page: ${notion_page.id}`)

    let normalized_updates

    if (database_id) {
      // Database item
      const entity_type = get_entity_type_for_database(database_id)
      if (!entity_type) {
        throw new Error(
          `No entity type mapping found for database: ${database_id}`
        )
      }

      const mapping_config = get_database_mapping_config(database_id)
      normalized_updates = await normalize_notion_database_item(
        notion_page,
        mapping_config,
        database_id
      )
    } else {
      // Standalone page
      normalized_updates = await normalize_notion_page(notion_page)
    }

    // Detect changes between existing entity and normalized updates
    const changes = detect_field_changes(existing_entity, normalized_updates)

    if (!changes || Object.keys(changes).length === 0) {
      log('No changes detected - skipping update')
      return {
        entity_id: existing_entity.entity_id,
        action: 'no_changes',
        changes: null
      }
    }

    // Merge updates while preserving important existing fields
    const updated_entity = {
      ...existing_entity,
      ...normalized_updates,
      entity_id: existing_entity.entity_id, // Preserve original entity ID
      type: existing_entity.type, // Preserve original type
      created_at: existing_entity.created_at, // Preserve creation time
      updated_at: new Date().toISOString() // Update modification time
    }

    // Preserve local-only fields if specified
    if (options.preserve_local_fields) {
      for (const field of options.preserve_local_fields) {
        if (existing_entity[field] !== undefined) {
          updated_entity[field] = existing_entity[field]
        }
      }
    }

    // Generate file path (may be the same as existing)
    const file_path = format_entity_path_for_notion(updated_entity)

    // Write updated entity to filesystem
    await write_entity_to_filesystem(updated_entity, file_path)

    const result = {
      entity_id: updated_entity.entity_id,
      action: 'updated',
      entity_type: updated_entity.type,
      name: updated_entity.name,
      file_path,
      changes,
      updated_at: updated_entity.updated_at
    }

    log(`Successfully updated entity: ${result.entity_type} - ${result.name}`)
    log(`Changes detected in fields: ${Object.keys(changes).join(', ')}`)

    return result
  } catch (error) {
    log(`Failed to update entity from Notion page: ${error.message}`)
    throw new Error(
      `Failed to update entity from Notion page: ${error.message}`
    )
  }
}
