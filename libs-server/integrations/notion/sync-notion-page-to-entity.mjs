/**
 * Sync Notion page/database item to local entity
 */

import debug from 'debug'
import path from 'path'
import { get_notion_page_with_blocks } from './notion-api/index.mjs'
import { normalize_notion_page } from './normalize-notion-page.mjs'
import { normalize_notion_database_item } from './normalize-notion-database-item.mjs'
import {
  extract_page_title,
  extract_and_map_properties,
  apply_property_conversions
} from './notion-utils.mjs'
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
import { get_user_base_directory } from '#libs-server/base-uri/base-directory-registry.mjs'

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

    // Determine external_id and entity_type early for path resolution
    let external_id
    let entity_type
    let mapping_config
    let conversion_rules
    let entity_schema
    let title

    if (database_id) {
      external_id = `notion:database:${database_id}:${page_id}`
      entity_type = get_entity_type_for_database(database_id)
      if (!entity_type) {
        throw new Error(
          `No entity type mapping found for database: ${database_id}`
        )
      }
      mapping_config = get_database_mapping_config(database_id)
      conversion_rules = get_conversion_rules()

      // Load schema definition for the entity type
      const schemas = await load_schema_definitions_from_filesystem()
      entity_schema = schemas[entity_type]

      // Extract title from mapped properties for path generation
      const { extracted_properties, mapped_properties } =
        extract_and_map_properties(notion_page, mapping_config)
      const converted_properties = apply_property_conversions(
        mapped_properties,
        mapping_config,
        conversion_rules
      )
      notion_page.extracted_properties = extracted_properties
      title = extract_page_title(notion_page, converted_properties)
    } else {
      external_id = `notion:page:${page_id}`
      entity_type = 'text'
      title = extract_page_title(notion_page)
    }

    // Build minimal entity_properties for path generation and entity lookup
    const minimal_entity_properties = {
      type: entity_type,
      title,
      name: title
    }

    // Check if entity already exists EARLY (before normalization)
    const existing_entity = await find_entity_for_notion_page(
      external_id,
      minimal_entity_properties
    )

    // Determine entity path and files directory BEFORE normalization
    let entity_absolute_path
    let entity_base_uri

    if (existing_entity) {
      log(`Found existing entity by external_id: ${existing_entity.entity_id}`)
      entity_absolute_path = existing_entity.absolute_path
      entity_base_uri = create_base_uri_from_path(entity_absolute_path)
    } else {
      log(
        `No existing entity found for external_id: ${external_id} - will create new entity`
      )
      // Generate paths for the new entity
      const generated_paths =
        await generate_entity_paths_with_database_disambiguation({
          entity_properties: minimal_entity_properties,
          external_id,
          database_id
        })
      entity_absolute_path = generated_paths.absolute_path
      entity_base_uri = generated_paths.base_uri
    }

    // Compute entity files directory for entity-adjacent file storage
    // Files go in a directory named after the entity (without .md extension)
    const user_base_directory = get_user_base_directory()
    const entity_relative_path = path.relative(
      user_base_directory,
      entity_absolute_path
    )
    const entity_files_directory = entity_relative_path.replace(/\.md$/, '')
    log(`Entity files directory: ${entity_files_directory}`)

    // Now normalize with entity_files_directory for proper file storage
    let entity_properties
    let entity_content

    if (database_id) {
      const normalized_result = await normalize_notion_database_item(
        notion_page,
        mapping_config,
        database_id,
        {
          ...options,
          conversion_rules,
          schema: entity_schema,
          entity_files_directory
        }
      )
      entity_properties = normalized_result.entity_properties
      entity_content = normalized_result.entity_content
    } else {
      const normalized_result = await normalize_notion_page(notion_page, {
        ...options,
        entity_files_directory
      })
      entity_properties = normalized_result.entity_properties
      entity_content = normalized_result.entity_content
    }

    // Create or update the entity
    let sync_result
    if (existing_entity) {
      log(`Updating existing entity: ${existing_entity.entity_id}`)

      const update_result = await update_entity_from_external_item({
        external_item: notion_page,
        entity_properties,
        entity_content,
        entity_type: entity_properties.type,
        external_system: 'notion',
        external_id,
        absolute_path: entity_absolute_path,
        external_update_time: notion_page.last_edited_time,
        import_history_base_directory: options.import_history_base_directory,
        force: options.force || false
      })

      sync_result = {
        ...update_result,
        entity_type: entity_properties.type,
        file_path: entity_absolute_path,
        base_uri: entity_base_uri
      }
    } else {
      log(`Creating new entity from Notion page: ${page_id}`)

      const create_result = await create_entity_from_external_item({
        external_item: notion_page,
        entity_properties,
        entity_content,
        entity_type: entity_properties.type,
        external_system: 'notion',
        external_id,
        absolute_path: entity_absolute_path,
        user_public_key: entity_properties.user_public_key,
        import_history_base_directory: options.import_history_base_directory
      })

      sync_result = {
        action: 'created',
        entity_id: create_result.entity_id,
        entity_type: entity_properties.type,
        file_path: entity_absolute_path,
        base_uri: entity_base_uri
      }
    }

    log(
      `Successfully synced Notion page to entity: ${sync_result.action} ${sync_result.entity_type}`
    )
    return sync_result
  } catch (error) {
    log(`Failed to sync Notion page to entity: ${error.message}`)
    throw new Error(`Failed to sync Notion page to entity: ${error.message}`)
  }
}
