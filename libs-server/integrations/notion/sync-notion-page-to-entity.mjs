/**
 * Sync Notion page/database item to local entity
 */

import debug from 'debug'
import { get_notion_page_with_blocks } from './notion-api/index.mjs'
import { normalize_notion_page } from './normalize-notion-page.mjs'
import { normalize_notion_database_item } from './normalize-notion-database-item.mjs'
import {
  get_entity_type_for_database,
  get_database_mapping_config,
  get_conversion_rules
} from './notion-entity-mapper.mjs'
import { load_schema_definitions_from_filesystem } from '#libs-server/repository/filesystem/load-schema-definitions-from-filesystem.mjs'
import { update_entity_from_external_item } from '#libs-server/sync/index.mjs'
import { create_entity_from_external_item } from '#libs-server/entity/index.mjs'
import { generate_entity_paths_with_database_disambiguation } from './generate-entity-paths-with-disambiguation.mjs'
import { find_entity_for_notion_page } from './entity/find-entity-for-notion-page.mjs'
import { create_base_uri_from_path } from '#libs-server/base-uri/base-uri-utilities.mjs'

const log = debug('integrations:notion:sync-page-to-entity')

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

    let entity_properties
    let entity_content
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
      const conversion_rules = get_conversion_rules()

      // Load schema definition for the entity type
      const schemas = await load_schema_definitions_from_filesystem()
      const entity_schema = schemas[entity_type]

      const normalized_result = await normalize_notion_database_item(
        notion_page,
        mapping_config,
        database_id,
        { ...options, conversion_rules, schema: entity_schema }
      )
      entity_properties = normalized_result.entity_properties
      entity_content = normalized_result.entity_content
    } else {
      // This is a standalone page
      external_id = `notion:page:${page_id}`
      const normalized_result = await normalize_notion_page(
        notion_page,
        options
      )
      entity_properties = normalized_result.entity_properties
      entity_content = normalized_result.entity_content
    }

    // Check if entity already exists by external_id using filesystem search
    // STRICT ENFORCEMENT: Only match by external_id - no fallback to name matching
    const existing_entity = await find_entity_for_notion_page(
      external_id,
      entity_properties
    )

    if (existing_entity) {
      log(`Found existing entity by external_id: ${existing_entity.entity_id}`)
    } else {
      log(
        `No existing entity found for external_id: ${external_id} - will create new entity`
      )
    }

    let sync_result
    if (existing_entity) {
      // Update existing entity using shared function
      log(`Updating existing entity: ${existing_entity.entity_id}`)

      // Preserve existing entity location - derive base_uri from existing path
      const existing_entity_base_uri = create_base_uri_from_path(
        existing_entity.absolute_path
      )

      // Use the shared update function with clean normalized entity data
      const update_result = await update_entity_from_external_item({
        external_item: notion_page,
        entity_properties,
        entity_content,
        entity_type: entity_properties.type,
        external_system: 'notion',
        external_id,
        absolute_path: existing_entity.absolute_path,
        external_update_time: notion_page.last_edited_time,
        import_history_base_directory: options.import_history_base_directory,
        force: options.force || false
      })

      sync_result = {
        ...update_result,
        entity_type: entity_properties.type,
        file_path: existing_entity.absolute_path,
        base_uri: existing_entity_base_uri
      }
    } else {
      // Create new entity using shared function
      log(`Creating new entity from Notion page: ${page_id}`)

      // Generate paths for the new entity
      const { base_uri, absolute_path } =
        await generate_entity_paths_with_database_disambiguation({
          entity_properties,
          external_id,
          database_id
        })

      // Use the shared create function
      const create_result = await create_entity_from_external_item({
        external_item: notion_page,
        entity_properties,
        entity_content,
        entity_type: entity_properties.type,
        external_system: 'notion',
        external_id,
        absolute_path,
        user_public_key: entity_properties.user_public_key,
        import_history_base_directory: options.import_history_base_directory
      })

      sync_result = {
        action: 'created',
        entity_id: create_result.entity_id,
        entity_type: entity_properties.type,
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
