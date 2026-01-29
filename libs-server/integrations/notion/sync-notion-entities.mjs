/**
 * High-level orchestration for Notion entity synchronization
 */

import debug from 'debug'
import { get_notion_api_client } from './notion-api/create-notion-client.mjs'
import {
  get_all_notion_search_results,
  get_all_notion_database_items
} from './notion-api/index.mjs'
import { sync_notion_page_to_entity } from './sync-notion-page-to-entity.mjs'
import { batch_sync_entities_to_notion } from './sync-entity-to-notion.mjs'
import { get_configured_database_ids } from './notion-entity-mapper.mjs'

const log = debug('integrations:notion:sync-entities')

/**
 * Search for all Notion pages and databases with filtering
 * @param {Object} options - Search options
 * @returns {Object} Search results grouped by type
 */
export async function search_all_notion_content(options = {}) {
  try {
    log('Starting comprehensive Notion content search')

    const search_options = {
      page_size: options.page_size || 100,
      sort_direction: options.sort_direction || 'descending',
      sort_timestamp: options.sort_timestamp || 'last_edited_time',
      ...options
    }

    // Get all search results (both pages and databases)
    const all_results = await get_all_notion_search_results({
      ...search_options,
      timeout_ms: options.timeout_ms,
      retry_config: options.retry_config
    })

    // Separate databases and pages
    const databases = []
    const standalone_pages = []
    const database_pages = []

    for (const item of all_results) {
      if (item.object === 'database') {
        databases.push(item)
      } else if (item.object === 'page') {
        // Check if this page is in a database
        if (item.parent?.type === 'database_id') {
          database_pages.push(item)
        } else {
          standalone_pages.push(item)
        }
      }
    }

    log(
      `Search found: ${databases.length} databases, ${standalone_pages.length} standalone pages, ${database_pages.length} database pages`
    )

    return {
      databases,
      standalone_pages,
      database_pages,
      total_results: all_results.length
    }
  } catch (error) {
    log(`Failed to search Notion content: ${error.message}`)
    throw error
  }
}

/**
 * Get all pages from a Notion database using the new API
 * @param {string} database_id - Database ID to query
 * @param {Object} options - Query options
 * @returns {Array} Array of page objects
 */
async function get_all_database_pages(database_id, options = {}) {
  try {
    log(`Getting all pages from database: ${database_id}`)

    const query_options = {
      database_id,
      page_size: options.page_size || 100,
      filter: options.filter,
      sorts: options.sorts
    }

    const pages = await get_all_notion_database_items({
      ...query_options,
      timeout_ms: options.timeout_ms,
      retry_config: options.retry_config
    })
    log(`Retrieved ${pages.length} pages from database ${database_id}`)

    return pages
  } catch (error) {
    log(`Failed to get database pages: ${error.message}`)
    throw error
  }
}

/**
 * Sync all pages from a Notion database to local entities
 * @param {string} database_id - Database ID to sync
 * @param {Object} options - Sync options
 * @returns {Object} Sync results summary
 */
export async function sync_notion_database_to_entities(
  database_id,
  options = {}
) {
  try {
    log(`Starting sync for Notion database: ${database_id}`)

    // Get all pages from the database
    const pages = await get_all_database_pages(database_id, {
      page_size: options.page_size || 50,
      delay: options.rate_limit_delay || 350,
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
        const sync_result = await sync_notion_page_to_entity(
          page.id,
          database_id,
          options
        )

        results.processed++
        if (sync_result.action === 'created') {
          results.created++
        } else if (sync_result.action === 'updated') {
          results.updated++
        }

        log(
          `Processed page ${results.processed}/${results.total_pages}: ${sync_result.action}`
        )

        // Rate limiting between page syncs
        if (options.rate_limit_delay) {
          await new Promise((resolve) =>
            setTimeout(resolve, options.rate_limit_delay)
          )
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

    log(
      `Database sync completed: ${results.processed} processed, ${results.created} created, ${results.updated} updated, ${results.failed} failed`
    )
    return results
  } catch (error) {
    log(`Failed to sync Notion database: ${error.message}`)
    throw new Error(`Failed to sync Notion database: ${error.message}`)
  }
}

/**
 * Sync all Notion content (databases and pages) using search API
 * @param {Object} options - Sync options
 * @param {string} [options.since] - ISO date string to filter by last_edited_time
 * @param {boolean} [options.databases_only] - Only sync database items
 * @param {boolean} [options.pages_only] - Only sync standalone pages
 * @param {string} [options.database_id] - Sync specific database only
 * @param {string} [options.page_id] - Sync specific page only
 * @returns {Object} Comprehensive sync results
 */
export async function sync_all_notion_content_to_entities(options = {}) {
  try {
    // Handle single page sync
    if (options.page_id) {
      log(`Syncing single Notion page: ${options.page_id}`)
      const single_page_result = await sync_single_notion_page_to_entity(
        options.page_id,
        options
      )

      // Format result to match the expected structure
      return {
        timestamp: new Date().toISOString(),
        single_page: true,
        page_id: options.page_id,
        success: single_page_result.success,
        action: single_page_result.action,
        entity_id: single_page_result.entity_id,
        database_id: single_page_result.database_id,
        error: single_page_result.error
      }
    }

    // Handle specific database sync - use direct database API instead of search API
    if (options.database_id) {
      log(`Syncing specific Notion database: ${options.database_id}`)
      const database_result = await sync_notion_database_to_entities(
        options.database_id,
        options
      )

      // Format result to match the expected structure
      return {
        timestamp: new Date().toISOString(),
        single_database: true,
        database_id: options.database_id,
        databases: {
          total: 1,
          processed: 1,
          created: 0,
          updated: 0,
          skipped: 0,
          errors: database_result.failed > 0 ? 1 : 0,
          details: []
        },
        standalone_pages: {
          total: 0,
          processed: 0,
          created: 0,
          updated: 0,
          skipped: 0,
          errors: 0,
          details: []
        },
        database_pages: {
          total: database_result.total_pages,
          processed: database_result.processed,
          created: database_result.created,
          updated: database_result.updated,
          skipped: 0,
          errors: database_result.failed,
          details: []
        }
      }
    }

    log('Starting comprehensive Notion content sync')

    // For search API, we need to let the API do the filtering when possible
    const search_options = {
      page_size: options.page_size || 50,
      sort_direction: 'descending',
      sort_timestamp: 'last_edited_time'
    }

    // Add date filtering if specified
    if (options.since) {
      // Note: Notion search API doesn't support date filtering directly,
      // we'll need to filter results after getting them
      log(`Filtering by last_edited_time since: ${options.since}`)
    }

    // Get all content
    const content = await search_all_notion_content(search_options)

    const results = {
      timestamp: new Date().toISOString(),
      since: options.since,
      databases: {
        total: content.databases.length,
        processed: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
        details: []
      },
      standalone_pages: {
        total: content.standalone_pages.length,
        processed: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
        details: []
      },
      database_pages: {
        total: content.database_pages.length,
        processed: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
        details: []
      }
    }

    // Apply date filtering
    if (options.since) {
      const since_date = new Date(options.since)

      content.databases = content.databases.filter(
        (db) => new Date(db.last_edited_time) > since_date
      )
      content.standalone_pages = content.standalone_pages.filter(
        (page) => new Date(page.last_edited_time) > since_date
      )
      content.database_pages = content.database_pages.filter(
        (page) => new Date(page.last_edited_time) > since_date
      )

      log(
        `After date filtering: ${content.databases.length} databases, ${content.standalone_pages.length} standalone pages, ${content.database_pages.length} database pages`
      )
    }

    // Sync standalone pages (unless databases_only is specified)
    if (!options.databases_only && content.standalone_pages.length > 0) {
      log(`Syncing ${content.standalone_pages.length} standalone pages`)

      for (const page of content.standalone_pages) {
        try {
          const sync_result = await sync_notion_page_to_entity(
            page.id,
            null,
            options
          )

          results.standalone_pages.processed++
          if (sync_result.action === 'created') {
            results.standalone_pages.created++
          } else if (sync_result.action === 'updated') {
            results.standalone_pages.updated++
          } else if (sync_result.action === 'skipped') {
            results.standalone_pages.skipped++
          }

          if (options.verbose) {
            results.standalone_pages.details.push({
              page_id: page.id,
              action: sync_result.action,
              entity_id: sync_result.entity_id
            })
          }

          // Rate limiting
          if (options.rate_limit_delay) {
            await new Promise((resolve) =>
              setTimeout(resolve, options.rate_limit_delay)
            )
          }
        } catch (error) {
          results.standalone_pages.errors++
          log(`Failed to sync standalone page ${page.id}: ${error.message}`)

          if (options.verbose) {
            results.standalone_pages.details.push({
              page_id: page.id,
              action: 'error',
              error: error.message
            })
          }
        }
      }
    }

    // Sync database pages (unless pages_only is specified)
    if (!options.pages_only && content.database_pages.length > 0) {
      log(`Syncing ${content.database_pages.length} database pages`)

      // Group database pages by database for batch processing
      const pages_by_database = {}
      for (const page of content.database_pages) {
        const db_id = page.parent.database_id
        if (!pages_by_database[db_id]) {
          pages_by_database[db_id] = []
        }
        pages_by_database[db_id].push(page)
      }

      for (const [db_id, pages] of Object.entries(pages_by_database)) {
        log(`Processing ${pages.length} pages from database ${db_id}`)

        for (const page of pages) {
          try {
            const sync_result = await sync_notion_page_to_entity(
              page.id,
              db_id,
              options
            )

            results.database_pages.processed++
            if (sync_result.action === 'created') {
              results.database_pages.created++
            } else if (sync_result.action === 'updated') {
              results.database_pages.updated++
            } else if (sync_result.action === 'skipped') {
              results.database_pages.skipped++
            }

            if (options.verbose) {
              results.database_pages.details.push({
                page_id: page.id,
                database_id: db_id,
                action: sync_result.action,
                entity_id: sync_result.entity_id
              })
            }

            // Rate limiting
            if (options.rate_limit_delay) {
              await new Promise((resolve) =>
                setTimeout(resolve, options.rate_limit_delay)
              )
            }
          } catch (error) {
            results.database_pages.errors++
            log(`Failed to sync database page ${page.id}: ${error.message}`)

            if (options.verbose) {
              results.database_pages.details.push({
                page_id: page.id,
                database_id: db_id,
                action: 'error',
                error: error.message
              })
            }
          }
        }
      }
    }

    // Update totals after filtering
    results.databases.total = content.databases.length
    results.standalone_pages.total = content.standalone_pages.length
    results.database_pages.total = content.database_pages.length

    const total_processed =
      results.standalone_pages.processed + results.database_pages.processed
    const total_created =
      results.standalone_pages.created + results.database_pages.created
    const total_updated =
      results.standalone_pages.updated + results.database_pages.updated
    const total_errors =
      results.standalone_pages.errors + results.database_pages.errors

    log(
      `Notion content sync completed: ${total_processed} processed, ${total_created} created, ${total_updated} updated, ${total_errors} errors`
    )

    return results
  } catch (error) {
    log(`Failed to sync Notion content: ${error.message}`)
    throw error
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
        const database_result = await sync_notion_database_to_entities(
          database_id,
          options
        )
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
        await new Promise((resolve) =>
          setTimeout(resolve, options.database_delay)
        )
      }
    }

    const summary = {
      total_databases: database_ids.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results
    }

    log(
      `All databases sync completed: ${summary.successful}/${summary.total_databases} successful`
    )
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
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results
    }

    log(
      `Entity sync to Notion completed: ${summary.successful}/${summary.total_entities} successful`
    )
    return summary
  } catch (error) {
    log(`Failed to sync entities to Notion: ${error.message}`)
    throw new Error(`Failed to sync entities to Notion: ${error.message}`)
  }
}

/**
 * Perform bi-directional sync between Notion and local entities
 * @param {Object} options - Sync options
 * @param {string} [options.page_id] - Sync specific page only
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
      if (options.page_id) {
        log('Starting import phase for single page: Notion → Local entities')
        results.import_results =
          await sync_all_notion_content_to_entities(options)
      } else {
        log('Starting import phase: Notion → Local entities')
        results.import_results =
          await sync_all_notion_databases_to_entities(options)
      }
    }

    // Then, export local entity changes to Notion
    if (options.export !== false && options.entity_ids) {
      log('Starting export phase: Local entities → Notion')
      // results.export_results = await sync_entities_to_notion(options.entity_ids, options)
    }

    log('Bi-directional sync completed')
    return results
  } catch (error) {
    log(`Failed bi-directional sync: ${error.message}`)
    throw new Error(`Failed bi-directional sync: ${error.message}`)
  }
}

/**
 * Sync a single Notion page to a local entity
 * @param {string} page_id - Notion page ID to sync
 * @param {Object} options - Sync options
 * @returns {Object} Sync result
 */
export async function sync_single_notion_page_to_entity(page_id, options = {}) {
  try {
    log(`Starting sync for single Notion page: ${page_id}`)

    // Get the page to determine if it's in a database
    const notion_client = get_notion_api_client({
      timeout_ms: options.timeout_ms,
      retry_config: options.retry_config
    })
    const page = await notion_client.pages.retrieve({ page_id })

    let database_id = null
    if (page.parent?.type === 'database_id') {
      database_id = page.parent.database_id
      log(`Page is in database: ${database_id}`)
    } else {
      log('Page is a standalone page')
    }

    const sync_result = await sync_notion_page_to_entity(
      page_id,
      database_id,
      options
    )

    log(`Single page sync completed: ${sync_result.action}`)
    return {
      success: true,
      page_id,
      database_id,
      ...sync_result
    }
  } catch (error) {
    log(`Failed to sync single Notion page ${page_id}: ${error.message}`)
    return {
      success: false,
      page_id,
      error: error.message
    }
  }
}
