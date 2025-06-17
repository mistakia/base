/**
 * Sync local entity changes to Notion
 */

import debug from 'debug'
import {
  update_notion_page_properties,
  create_notion_database_page,
  update_notion_database_page
} from './notion-api/index.mjs'
import {
  convert_entity_to_notion_properties,
  get_database_id_for_entity_type,
  get_entity_mapping_config
} from './notion-entity-mapper.mjs'

const log = debug('integrations:notion:sync-entity-to-notion')

/**
 * Check if entity has Notion external ID
 * @param {Object} entity - Entity object
 * @returns {Object|null} Parsed external ID info or null
 */
function parse_notion_external_id(entity) {
  if (!entity.external_id || !entity.external_id.startsWith('notion:')) {
    return null
  }

  const parts = entity.external_id.split(':')
  if (parts.length < 3) {
    return null
  }

  if (parts[1] === 'page') {
    // notion:page:page_id
    return {
      type: 'page',
      page_id: parts[2]
    }
  } else if (parts[1] === 'database' && parts.length >= 4) {
    // notion:database:database_id:page_id
    return {
      type: 'database_item',
      database_id: parts[2],
      page_id: parts[3]
    }
  }

  return null
}

/**
 * Convert entity content to Notion blocks (simplified)
 * @param {string} content - Markdown content
 * @returns {Array} Array of Notion block objects
 */
function markdown_to_notion_blocks_simple(content) {
  if (!content || !content.trim()) {
    return []
  }

  // For now, create a simple paragraph block
  // This could be enhanced to parse full markdown later
  return [
    {
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [
          {
            type: 'text',
            text: { content: content.trim() }
          }
        ]
      }
    }
  ]
}

/**
 * Sync entity changes to existing Notion page
 * @param {Object} entity - Entity object
 * @param {Object} notion_info - Parsed Notion external ID info
 * @returns {Object} Sync result
 */
async function sync_to_existing_notion_page(entity, notion_info) {
  log(`Syncing entity to existing Notion ${notion_info.type}: ${notion_info.page_id}`)

  if (notion_info.type === 'database_item') {
    // Update database page properties
    const properties = convert_entity_to_notion_properties(entity.type, entity)

    await update_notion_database_page(notion_info.page_id, properties)

    return {
      action: 'updated',
      notion_type: 'database_item',
      page_id: notion_info.page_id,
      database_id: notion_info.database_id
    }
  } else {
    // Update standalone page properties
    const properties = {
      title: {
        title: [
          {
            type: 'text',
            text: { content: entity.name }
          }
        ]
      }
    }

    await update_notion_page_properties(notion_info.page_id, properties)

    return {
      action: 'updated',
      notion_type: 'page',
      page_id: notion_info.page_id
    }
  }
}

/**
 * Create new Notion database page from entity
 * @param {Object} entity - Entity object
 * @returns {Object} Sync result
 */
async function create_new_notion_database_page(entity) {
  log(`Creating new Notion database page for entity: ${entity.entity_id}`)

  // Get database ID for entity type
  const database_id = get_database_id_for_entity_type(entity.type)
  if (!database_id) {
    throw new Error(`No database mapping found for entity type: ${entity.type}`)
  }

  // Convert entity properties to Notion format
  const properties = convert_entity_to_notion_properties(entity.type, entity)

  // Convert content to blocks if present
  const children = entity.content ? markdown_to_notion_blocks_simple(entity.content) : null

  // Create the page
  const created_page = await create_notion_database_page(database_id, properties, children)

  return {
    action: 'created',
    notion_type: 'database_item',
    page_id: created_page.id,
    database_id,
    notion_url: created_page.url
  }
}

/**
 * Sync local entity to Notion
 * @param {Object} entity - Entity object to sync
 * @param {Object} options - Sync options
 * @returns {Object} Sync result
 */
export async function sync_entity_to_notion(entity, options = {}) {
  try {
    log(`Starting sync for entity to Notion: ${entity.entity_id}`)

    // Check if entity already has a Notion external ID
    const notion_info = parse_notion_external_id(entity)

    let sync_result

    if (notion_info) {
      // Update existing Notion page
      sync_result = await sync_to_existing_notion_page(entity, notion_info)
    } else {
      // Check if entity type has a configured database mapping
      const mapping_config = get_entity_mapping_config(entity.type)
      if (mapping_config) {
        // Create new database page
        sync_result = await create_new_notion_database_page(entity)

        // Update entity with new external ID (this would need to be persisted)
        const new_external_id = `notion:database:${sync_result.database_id}:${sync_result.page_id}`
        log(`Generated new external_id: ${new_external_id}`)
        sync_result.new_external_id = new_external_id
      } else {
        throw new Error(`No Notion mapping configured for entity type: ${entity.type}`)
      }
    }

    sync_result.entity_id = entity.entity_id
    sync_result.entity_type = entity.type
    sync_result.timestamp = new Date().toISOString()

    log(`Successfully synced entity to Notion: ${sync_result.action}`)
    return sync_result
  } catch (error) {
    log(`Failed to sync entity to Notion: ${error.message}`)
    throw new Error(`Failed to sync entity to Notion: ${error.message}`)
  }
}

/**
 * Batch sync multiple entities to Notion
 * @param {Array} entities - Array of entity objects
 * @param {Object} options - Sync options
 * @returns {Array} Array of sync results
 */
export async function batch_sync_entities_to_notion(entities, options = {}) {
  const results = []
  const { delay = 500 } = options // Rate limiting delay

  for (const entity of entities) {
    try {
      const result = await sync_entity_to_notion(entity, options)
      results.push({ success: true, entity_id: entity.entity_id, result })
    } catch (error) {
      results.push({
        success: false,
        entity_id: entity.entity_id,
        error: error.message
      })
    }

    // Rate limiting - wait between requests
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  return results
}
