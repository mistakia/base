/**
 * Create entity from Notion page
 */

import debug from 'debug'
import path from 'path'
import { normalize_notion_page } from '../normalize-notion-page.mjs'
import { normalize_notion_database_item } from '../normalize-notion-database-item.mjs'
import {
  get_entity_type_for_database,
  get_database_mapping_config
} from '../notion-entity-mapper.mjs'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/index.mjs'
import { format_entity_path_for_notion } from './format-entity-path-for-notion.mjs'
import { cache_entity } from '../cache/notion-entity-cache.mjs'
import config from '#config'

const log = debug('integrations:notion:entity:create')

/**
 * Create a new entity from a Notion page
 * @param {Object} notion_page - Notion page object with blocks
 * @param {string} database_id - Database ID (null for standalone pages)
 * @returns {Object} Created entity result
 */
export async function create_entity_from_notion_page(
  notion_page,
  database_id = null
) {
  try {
    log(`Creating entity from Notion page: ${notion_page.id}`)

    let entity_properties
    let entity_content

    if (database_id) {
      // Database item
      const entity_type = get_entity_type_for_database(database_id)
      if (!entity_type) {
        throw new Error(
          `No entity type mapping found for database: ${database_id}`
        )
      }

      const mapping_config = get_database_mapping_config(database_id)
      const normalized_result = await normalize_notion_database_item(
        notion_page,
        mapping_config,
        database_id
      )
      entity_properties = normalized_result.entity_properties
      entity_content = normalized_result.entity_content
    } else {
      // Standalone page
      const normalized_result = await normalize_notion_page(notion_page)
      entity_properties = normalized_result.entity_properties
      entity_content = normalized_result.entity_content
    }

    // Generate file path for the entity
    const file_path = format_entity_path_for_notion(entity_properties)

    // Write entity to filesystem
    await write_entity_to_filesystem({
      absolute_path: file_path,
      entity_properties,
      entity_type: entity_properties.type,
      entity_content: entity_content || ''
    })

    // Update cache with new entity mapping
    if (entity_properties.external_id) {
      const user_base_directory = config.user_base_directory
      if (user_base_directory && file_path.startsWith(user_base_directory)) {
        const relative_path = path.relative(user_base_directory, file_path)
        const base_uri = `user:${relative_path}`
        await cache_entity(entity_properties.external_id, base_uri)
        log(
          `Cached new entity mapping: ${entity_properties.external_id} -> ${base_uri}`
        )
      }
    }

    const result = {
      entity_id: entity_properties.entity_id,
      entity_type: entity_properties.type,
      name: entity_properties.name,
      file_path,
      external_id: entity_properties.external_id,
      created_at: new Date().toISOString()
    }

    log(`Successfully created entity: ${result.entity_type} - ${result.name}`)
    return result
  } catch (error) {
    log(`Failed to create entity from Notion page: ${error.message}`)
    throw new Error(
      `Failed to create entity from Notion page: ${error.message}`
    )
  }
}
