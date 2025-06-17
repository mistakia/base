/**
 * High-level orchestration for Notion entity synchronization
 */

import debug from 'debug'
import { get_notion_client } from './notion-api/create-notion-client.mjs'
import { sync_notion_page_to_entity } from './sync-notion-page-to-entity.mjs'
import { batch_sync_entities_to_notion } from './sync-entity-to-notion.mjs'
import { get_configured_database_ids } from './notion-entity-mapper.mjs'

const log = debug('integrations:notion:sync-entities')

/**
 * Get all pages from a Notion database
 * @param {string} database_id - Database ID to query
 * @param {Object} options - Query options
 * @returns {Array} Array of page objects
 */
async function get_all_database_pages(database_id, options = {}) {
  const notion = get_notion_client()
  if (!notion) {
    throw new Error('Notion client not available')
  }

  const pages = []
  let start_cursor
  let has_more = true

  while (has_more) {
    const response = await notion.databases.query({
      database_id,
      start_cursor,
      page_size: options.page_size || 100,
      filter: options.filter,
      sorts: options.sorts
    })

    pages.push(...response.results)
    has_more = response.has_more
    start_cursor = response.next_cursor

    // Rate limiting
    if (has_more && options.delay) {
      await new Promise(resolve => setTimeout(resolve, options.delay))
    }
  }

  return pages
}

/**
 * Sync all pages from a Notion database to local entities
 * @param {string} database_id - Database ID to sync
 * @param {Object} options - Sync options
 * @returns {Object} Sync results summary
 */
export async function sync_notion_database_to_entities(database_id, options = {}) {
  try {
    log(`Starting sync for Notion database: ${database_id}`)

    // Get all pages from the database
    const pages = await get_all_database_pages(database_id, {
      page_size: options.page_size || 50,
      delay: options.rate_limit_delay || 200,
      filter: options.filter,
      sorts: options.sorts
    })

    log(`Found ${pages.length} pages in database`)

    const results = {
      database_id,
      total_pages: pages.length,
      processed: 0,
      created: 0,
      updated: 0,
      failed: 0,
      errors: []
    }

    // Process each page
    for (const page of pages) {
      try {
        const sync_result = await sync_notion_page_to_entity(page.id, database_id, options)

        results.processed++
        if (sync_result.action === 'created') {
          results.created++
        } else if (sync_result.action === 'updated') {
          results.updated++
        }

        log(`Processed page ${results.processed}/${results.total_pages}: ${sync_result.action}`)

        // Rate limiting between page syncs
        if (options.rate_limit_delay) {
          await new Promise(resolve => setTimeout(resolve, options.rate_limit_delay))
        }
      } catch (error) {
        results.failed++
        results.errors.push({
          page_id: page.id,
          error: error.message
        })
        log(`Failed to sync page ${page.id}: ${error.message}`)
      }
    }

    log(`Database sync completed: ${results.processed} processed, ${results.created} created, ${results.updated} updated, ${results.failed} failed`)
    return results
  } catch (error) {
    log(`Failed to sync Notion database: ${error.message}`)
    throw new Error(`Failed to sync Notion database: ${error.message}`)
  }
}

/**
 * Sync all configured Notion databases to local entities
 * @param {Object} options - Sync options
 * @returns {Array} Array of database sync results
 */
export async function sync_all_notion_databases_to_entities(options = {}) {
  try {
    log('Starting sync for all configured Notion databases')

    const database_ids = get_configured_database_ids()
    log(`Found ${database_ids.length} configured databases`)

    const results = []

    for (const database_id of database_ids) {
      try {
        const database_result = await sync_notion_database_to_entities(database_id, options)
        results.push({
          success: true,
          database_id,
          result: database_result
        })
      } catch (error) {
        results.push({
          success: false,
          database_id,
          error: error.message
        })
        log(`Failed to sync database ${database_id}: ${error.message}`)
      }

      // Delay between database syncs
      if (options.database_delay) {
        await new Promise(resolve => setTimeout(resolve, options.database_delay))
      }
    }

    const summary = {
      total_databases: database_ids.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    }

    log(`All databases sync completed: ${summary.successful}/${summary.total_databases} successful`)
    return summary
  } catch (error) {
    log(`Failed to sync all Notion databases: ${error.message}`)
    throw new Error(`Failed to sync all Notion databases: ${error.message}`)
  }
}

/**
 * Sync specific entities to Notion (export from local to Notion)
 * @param {Array} entity_ids - Array of entity IDs to sync
 * @param {Object} options - Sync options
 * @returns {Object} Sync results summary
 */
export async function sync_entities_to_notion(entity_ids, options = {}) {
  try {
    log(`Starting sync of ${entity_ids.length} entities to Notion`)

    // This would need to be implemented to read entities from the filesystem/database
    // For now, this is a placeholder
    const entities = [] // TODO: Load entities by IDs

    const results = await batch_sync_entities_to_notion(entities, options)

    const summary = {
      total_entities: entity_ids.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    }

    log(`Entity sync to Notion completed: ${summary.successful}/${summary.total_entities} successful`)
    return summary
  } catch (error) {
    log(`Failed to sync entities to Notion: ${error.message}`)
    throw new Error(`Failed to sync entities to Notion: ${error.message}`)
  }
}

/**
 * Perform bi-directional sync between Notion and local entities
 * @param {Object} options - Sync options
 * @returns {Object} Complete sync results
 */
export async function sync_notion_bidirectional(options = {}) {
  try {
    log('Starting bi-directional Notion sync')

    const results = {
      import_results: null,
      export_results: null,
      timestamp: new Date().toISOString()
    }

    // First, import from Notion to local entities
    if (options.import !== false) {
      log('Starting import phase: Notion → Local entities')
      results.import_results = await sync_all_notion_databases_to_entities(options)
    }

    // Then, export local entity changes to Notion
    if (options.export !== false && options.entity_ids) {
      log('Starting export phase: Local entities → Notion')
      results.export_results = await sync_entities_to_notion(options.entity_ids, options)
    }

    log('Bi-directional sync completed')
    return results
  } catch (error) {
    log(`Failed bi-directional sync: ${error.message}`)
    throw new Error(`Failed bi-directional sync: ${error.message}`)
  }
}
