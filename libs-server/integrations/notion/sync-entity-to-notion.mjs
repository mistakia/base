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
  convert_entity_to_notion_properties_from_entity,
  get_database_mapping_config_from_entity
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
  log(
    `Syncing entity to existing Notion ${notion_info.type}: ${notion_info.page_id}`
  )

  if (notion_info.type === 'database_item') {
    // Update database page properties
    const properties = convert_entity_to_notion_properties(
      notion_info.database_id,
      entity
    )

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

  // Check if entity has notion_database_id property
  if (!entity.notion_database_id) {
    throw new Error(
      `Entity ${entity.entity_id} does not have notion_database_id property. ` +
        'Add notion_database_id to entity frontmatter to specify target database.'
    )
  }

  const database_id = entity.notion_database_id

  // Validate database mapping exists
  const mapping_config = get_database_mapping_config_from_entity(entity)
  if (!mapping_config) {
    throw new Error(
      `No mapping configuration found for database: ${database_id}`
    )
  }

  // Convert entity properties to Notion format
  const properties = convert_entity_to_notion_properties_from_entity(entity)

  // Convert content to blocks if present
  const children = entity.content
    ? markdown_to_notion_blocks_simple(entity.content)
    : null

  // Create the page
  const created_page = await create_notion_database_page(
    database_id,
    properties,
    children
  )

  return {
    action: 'created',
    notion_type: 'database_item',
    page_id: created_page.id,
    database_id,
    notion_url: created_page.url
  }
}

/**
 * Analyze what changes would be synced to Notion (dry run)
 * @param {Object} entity - Entity object to analyze
 * @returns {Object} Analysis of what would be synced
 */
export async function analyze_entity_notion_sync(entity) {
  try {
    log(`Analyzing sync for entity to Notion: ${entity.entity_id}`)

    // Check if entity already has a Notion external ID
    const notion_info = parse_notion_external_id(entity)

    const analysis = {
      entity_id: entity.entity_id,
      entity_type: entity.type,
      entity_name: entity.name || entity.title,
      has_notion_external_id: !!notion_info,
      would_create: false,
      would_update: false,
      changes: {}
    }

    if (notion_info) {
      // Would update existing Notion page
      analysis.would_update = true
      analysis.notion_info = notion_info
      analysis.action = 'update_existing'

      if (notion_info.type === 'database_item') {
        // Analyze what properties would be updated
        const properties = convert_entity_to_notion_properties(
          notion_info.database_id,
          entity
        )
        analysis.changes.properties = properties
        analysis.changes.database_id = notion_info.database_id
      } else {
        // Analyze page title update
        analysis.changes.title = entity.name || entity.title
      }

      log(
        `Entity would UPDATE existing Notion ${notion_info.type}: ${notion_info.page_id}`
      )
    } else {
      // Check if entity has notion_database_id for creating new page
      if (entity.notion_database_id) {
        const mapping_config = get_database_mapping_config_from_entity(entity)
        if (mapping_config) {
          // Would create new database page
          analysis.would_create = true
          analysis.action = 'create_new'

          analysis.changes.database_id = entity.notion_database_id
          analysis.changes.properties =
            convert_entity_to_notion_properties_from_entity(entity)

          if (entity.content) {
            analysis.changes.content_blocks = markdown_to_notion_blocks_simple(
              entity.content
            )
          }

          log(
            `Entity would CREATE new Notion database page in database: ${entity.notion_database_id}`
          )
        } else {
          analysis.action = 'no_mapping'
          analysis.error = `No mapping configuration found for database: ${entity.notion_database_id}`
          log(`Entity cannot be synced: ${analysis.error}`)
        }
      } else {
        analysis.action = 'no_mapping'
        analysis.error = 'Entity does not have notion_database_id property'
        log(`Entity cannot be synced: ${analysis.error}`)
      }
    }

    analysis.timestamp = new Date().toISOString()
    return analysis
  } catch (error) {
    log(`Failed to analyze entity for Notion sync: ${error.message}`)
    return {
      entity_id: entity.entity_id,
      entity_type: entity.type,
      action: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    }
  }
}

/**
 * Sync local entity to Notion
 * @param {Object} entity - Entity object to sync
 * @param {Object} options - Sync options
 * @param {boolean} options.enable_notion_writes - Must be true to actually write to Notion
 * @param {boolean} options.dry_run - If true, only analyze what would be synced
 * @returns {Object} Sync result
 */
export async function sync_entity_to_notion(entity, options = {}) {
  const { enable_notion_writes = false, dry_run = false } = options

  // Safety check: prevent accidental writes to Notion
  if (!dry_run && !enable_notion_writes) {
    log(
      'SAFETY: Notion writes disabled. Use --enable-notion-writes to allow modifications to Notion'
    )
    const analysis = await analyze_entity_notion_sync(entity)
    return {
      ...analysis,
      action: 'prevented_write',
      message:
        'Notion writes disabled for safety. Use --enable-notion-writes flag to allow writing to Notion.'
    }
  }

  // If dry run requested, only analyze
  if (dry_run) {
    return await analyze_entity_notion_sync(entity)
  }

  try {
    log(
      `WRITING TO NOTION: Starting sync for entity to Notion: ${entity.entity_id}`
    )

    // Check if entity already has a Notion external ID
    const notion_info = parse_notion_external_id(entity)

    let sync_result

    if (notion_info) {
      // Update existing Notion page
      sync_result = await sync_to_existing_notion_page(entity, notion_info)
    } else {
      // Check if entity has notion_database_id for creating new page
      if (entity.notion_database_id) {
        const mapping_config = get_database_mapping_config_from_entity(entity)
        if (mapping_config) {
          // Create new database page
          sync_result = await create_new_notion_database_page(entity)

          // Update entity with new external ID (this would need to be persisted)
          const new_external_id = `notion:database:${sync_result.database_id}:${sync_result.page_id}`
          log(`Generated new external_id: ${new_external_id}`)
          sync_result.new_external_id = new_external_id
        } else {
          throw new Error(
            `No mapping configuration found for database: ${entity.notion_database_id}`
          )
        }
      } else {
        throw new Error(
          `Entity ${entity.entity_id} does not have notion_database_id property. ` +
            'Add notion_database_id to entity frontmatter to specify target database.'
        )
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
 * @param {boolean} options.enable_notion_writes - Must be true to actually write to Notion
 * @param {boolean} options.dry_run - If true, only analyze what would be synced
 * @returns {Array} Array of sync results
 */
export async function batch_sync_entities_to_notion(entities, options = {}) {
  const results = []
  const { delay = 500, enable_notion_writes = false, dry_run = false } = options

  // Log safety status
  if (dry_run) {
    log(
      `DRY RUN: Analyzing ${entities.length} entities for potential Notion sync`
    )
  } else if (!enable_notion_writes) {
    log(`SAFETY MODE: Notion writes disabled for ${entities.length} entities`)
  } else {
    log(`LIVE MODE: Will write ${entities.length} entities to Notion`)
  }

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

    // Rate limiting - wait between requests (only if actually making API calls)
    if (delay > 0 && !dry_run && enable_notion_writes) {
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  // Summary logging
  const successful = results.filter((r) => r.success).length
  const failed = results.filter((r) => !r.success).length

  if (dry_run) {
    log(`Analysis complete: ${successful} analyzed, ${failed} errors`)
  } else if (!enable_notion_writes) {
    log(`Safety check complete: ${successful} would sync, ${failed} errors`)
  } else {
    log(`Batch sync complete: ${successful} synced, ${failed} errors`)
  }

  return results
}
