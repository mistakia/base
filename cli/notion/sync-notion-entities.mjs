#!/usr/bin/env node

/**
 * Sync Notion Entities Script
 *
 * Command-line script to sync Notion pages and databases to local entities.
 * Similar to the GitHub import script but for Notion integration.
 */

import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import config from '#config'
import { isMain } from '#libs-server'
import { sync_all_notion_content_to_entities } from '#libs-server/integrations/notion/sync-notion-entities.mjs'

const log = debug('sync-notion-entities')

// Enable debug logging for Notion integration and DuckDB
debug.enable(
  'sync-notion-entities,integrations:notion*,embedded-index*,database:*,files:*'
)

//
// CLI configuration (placed at top to double as documentation)
//
const cli_description = `
Sync Notion pages and databases to local entities.

By default this runs in safety (read-only) mode and will NOT write changes back to Notion.
Use --enable-notion-writes to allow writes, or --dry-run to preview changes without writing.
`

const cli_parser = yargs(hideBin(process.argv))
  .scriptName('sync-notion-entities')
  .usage('$0 [options]\n\n' + cli_description)
  .option('since', {
    alias: 's',
    describe:
      'Only sync items updated since this date (ISO format, e.g. 2024-01-01T00:00:00Z)',
    type: 'string'
  })
  .option('force', {
    alias: 'f',
    describe: 'Force update all entities regardless of content changes',
    type: 'boolean',
    default: false
  })
  .option('databases-only', {
    describe: 'Only sync database items, skip standalone pages',
    type: 'boolean',
    default: false
  })
  .option('pages-only', {
    describe: 'Only sync standalone pages, skip database items',
    type: 'boolean',
    default: false
  })
  .option('database-id', {
    alias: 'd',
    describe: 'Sync only the specified database ID',
    type: 'string'
  })
  .option('page-id', {
    alias: 'p',
    describe: 'Sync only the specified page ID',
    type: 'string'
  })
  .option('notion-token', {
    alias: 't',
    describe: 'Notion API token (overrides config)',
    type: 'string'
  })
  .option('page-size', {
    describe: 'Number of items to fetch per API request',
    type: 'number',
    default: 50
  })
  .option('rate-limit', {
    alias: 'r',
    describe: 'Delay between API requests in milliseconds',
    type: 'number',
    default: 350
  })
  .option('timeout', {
    describe: 'Request timeout in milliseconds',
    type: 'number',
    default: 30000
  })
  .option('max-retries', {
    describe: 'Maximum number of retries for failed requests',
    type: 'number',
    default: 3
  })
  .option('verbose', {
    alias: 'v',
    describe: 'Enable verbose output with detailed results',
    type: 'boolean',
    default: false
  })
  .option('enable-notion-writes', {
    describe:
      'DANGER: Allow writing changes back to Notion (disabled by default for safety)',
    type: 'boolean',
    default: false
  })
  .option('dry-run', {
    describe: 'Analyze what would be synced without making any changes',
    type: 'boolean',
    default: false
  })
  .option('import-history-base-directory', {
    describe:
      'Base directory for import history (defaults to user base directory)',
    type: 'string'
  })
  .check((argv) => {
    // Validate mutually exclusive options
    if (argv.databasesOnly && argv.pagesOnly) {
      throw new Error('Cannot specify both --databases-only and --pages-only')
    }

    // Validate page-id exclusivity
    if (
      argv.pageId &&
      (argv.databaseId || argv.databasesOnly || argv.pagesOnly)
    ) {
      throw new Error(
        'Cannot specify --page-id with --database-id, --databases-only, or --pages-only'
      )
    }

    // Validate database-id with pages-only
    if (argv.databaseId && argv.pagesOnly) {
      throw new Error(
        'Cannot specify --database-id with --pages-only (database items are not standalone pages)'
      )
    }

    // Validate mutually exclusive sync modes
    if (argv.dryRun && argv.enableNotionWrites) {
      throw new Error(
        'Cannot specify both --dry-run and --enable-notion-writes'
      )
    }

    // Validate since date format if provided
    if (argv.since) {
      const date = new Date(argv.since)
      if (isNaN(date.getTime())) {
        throw new Error(
          'Invalid date format for --since. Use ISO format like 2024-01-01T00:00:00Z'
        )
      }
    }

    return true
  })
  .help('help')
  .alias('help', 'h')
  .describe('help', 'Show help')
  .example(
    '$0',
    'Sync all Notion content to local entities (READ-ONLY by default)'
  )
  .example(
    '$0 --dry-run',
    'Analyze what would be synced without making changes'
  )
  .example(
    '$0 --enable-notion-writes',
    'DANGER: Sync content AND write changes back to Notion'
  )
  .example(
    '$0 --since 2024-01-01T00:00:00Z',
    'Sync only items updated since January 1, 2024'
  )
  .example(
    '$0 --database-id 7078f88d-0299-4f7a-a375-98c759d83f8e',
    'Sync only items from the specified database (automatically excludes standalone pages)'
  )
  .example(
    '$0 --database-id 7078f88d-0299-4f7a-a375-98c759d83f8e --since 2024-01-01T00:00:00Z',
    'Sync only recent items from the specified database'
  )
  .example(
    '$0 --page-id 12345678-1234-1234-1234-123456789abc',
    'Sync only the specified page'
  )
  .example(
    '$0 --pages-only --verbose',
    'Sync only standalone pages with detailed output'
  )
  .example(
    '$0 --force --rate-limit 500',
    'Force sync all content with increased rate limiting'
  )

/**
 * Sync Notion entities to local entities
 * @param {Object} options - Sync options
 * @returns {Object} Sync results summary
 */
export default async function sync_notion_entities({
  since,
  force = false,
  databases_only = false,
  pages_only = false,
  database_id,
  page_id,
  notion_token,
  user_public_key,
  page_size = 50,
  rate_limit_delay = 350,
  timeout_ms = 30000,
  max_retries = 3,
  verbose = false,
  enable_notion_writes = false,
  dry_run = false,
  import_history_base_directory
} = {}) {
  try {
    log('Starting Notion entities sync')

    // Validate required configuration
    const notion_api_key = notion_token || config.notion_api_key
    if (!notion_api_key) {
      throw new Error(
        'NOTION_API_KEY is required. Set it in config or pass --notion-token'
      )
    }

    // Safety warnings and mode logging
    if (dry_run) {
      log(
        'DRY RUN MODE: Only analyzing what would be synced, no changes will be made'
      )
    } else if (enable_notion_writes) {
      log('LIVE MODE: Will write changes back to Notion')
    } else {
      log('SAFETY MODE: Notion writes disabled (read-only sync)')
    }

    log('Sync parameters:')
    log(`- Since: ${since || 'all time'}`)
    log(`- Force: ${force}`)
    log(`- Databases only: ${databases_only}`)
    log(`- Pages only: ${pages_only}`)
    log(`- Specific database: ${database_id || 'all'}`)
    log(`- Specific page: ${page_id || 'all'}`)
    log(`- Page size: ${page_size}`)
    log(`- Rate limit delay: ${rate_limit_delay}ms`)
    log(`- Request timeout: ${timeout_ms}ms`)
    log(`- Max retries: ${max_retries}`)
    log(`- Notion writes enabled: ${enable_notion_writes}`)
    log(`- Dry run mode: ${dry_run}`)

    // Prepare sync options
    const sync_options = {
      since,
      force,
      databases_only,
      pages_only,
      database_id,
      page_id,
      page_size,
      rate_limit_delay,
      timeout_ms,
      retry_config: {
        max_retries
      },
      verbose,
      notion_token: notion_api_key,
      user_public_key,
      enable_notion_writes,
      dry_run,
      import_history_base_directory
    }

    // Execute the sync
    const results = await sync_all_notion_content_to_entities(sync_options)

    // Handle single page results differently
    let totals
    if (results.single_page) {
      totals = {
        processed: results.success ? 1 : 0,
        created: results.action === 'created' ? 1 : 0,
        updated: results.action === 'updated' ? 1 : 0,
        skipped: results.action === 'skipped' ? 1 : 0,
        errors: results.success ? 0 : 1
      }
    } else {
      // Calculate totals across all content types
      totals = {
        processed:
          results.standalone_pages.processed + results.database_pages.processed,
        created:
          results.standalone_pages.created + results.database_pages.created,
        updated:
          results.standalone_pages.updated + results.database_pages.updated,
        skipped:
          results.standalone_pages.skipped + results.database_pages.skipped,
        errors: results.standalone_pages.errors + results.database_pages.errors
      }
    }

    // Enhanced results with summary
    const enhanced_results = {
      ...results,
      totals,
      summary: {
        sync_timestamp: results.timestamp,
        duration: Date.now() - new Date(results.timestamp).getTime(),
        content_types_synced: results.single_page
          ? { single_page: true }
          : {
              standalone_pages: !databases_only,
              database_pages: !pages_only
            },
        filters_applied: {
          since_date: since,
          specific_database: database_id,
          specific_page: page_id,
          force_update: force
        }
      }
    }

    log('Notion entities sync completed successfully')
    log(
      `Summary: ${totals.processed} processed, ${totals.created} created, ${totals.updated} updated, ${totals.skipped} skipped, ${totals.errors} errors`
    )

    return enhanced_results
  } catch (error) {
    log(`Error syncing Notion entities: ${error.message}`)
    console.error(error)
    throw error
  }
}

// Command-line interface
const main = async () => {
  try {
    const argv = cli_parser.argv

    const results = await sync_notion_entities({
      since: argv.since,
      force: argv.force,
      databases_only: argv.databasesOnly,
      pages_only: argv.pagesOnly,
      database_id: argv.databaseId,
      page_id: argv.pageId,
      notion_token: argv.notionToken,
      user_public_key: config.user_public_key,
      page_size: argv.pageSize,
      rate_limit_delay: argv.rateLimit,
      timeout_ms: argv.timeout,
      max_retries: argv.maxRetries,
      verbose: argv.verbose,
      enable_notion_writes: argv.enableNotionWrites,
      dry_run: argv.dryRun,
      import_history_base_directory: argv.importHistoryBaseDirectory
    })

    // Print concise result summary to console
    console.log('\n=== Notion Sync Results ===')

    // Show sync mode prominently
    if (argv.dryRun) {
      console.log('DRY RUN MODE: Analysis only, no changes made')
    } else if (argv.enableNotionWrites) {
      console.log('LIVE MODE: Changes written to Notion')
    } else {
      console.log('SAFETY MODE: Read-only sync, no writes to Notion')
    }

    console.log(`Timestamp: ${results.summary.sync_timestamp}`)

    if (results.summary.filters_applied.since_date) {
      console.log(`Since: ${results.summary.filters_applied.since_date}`)
    }

    if (results.summary.filters_applied.specific_database) {
      console.log(
        `Database: ${results.summary.filters_applied.specific_database}`
      )
    }

    if (results.summary.filters_applied.specific_page) {
      console.log(`Page: ${results.summary.filters_applied.specific_page}`)
    }

    console.log('\n--- Summary ---')
    console.log(`Total Processed: ${results.totals.processed}`)
    console.log(`Created: ${results.totals.created}`)
    console.log(`Updated: ${results.totals.updated}`)
    console.log(`Skipped: ${results.totals.skipped}`)
    console.log(`Errors: ${results.totals.errors}`)

    console.log('\n--- By Content Type ---')

    if (results.summary.content_types_synced.single_page) {
      console.log(`Single Page: ${results.page_id}`)
      console.log(`Action: ${results.action || 'error'}`)
      if (results.entity_id) {
        console.log(`Entity ID: ${results.entity_id}`)
      }
      if (results.database_id) {
        console.log(`Database ID: ${results.database_id}`)
      }
      if (results.error) {
        console.log(`Error: ${results.error}`)
      }
    } else {
      if (results.summary.content_types_synced.standalone_pages) {
        console.log(
          `Standalone Pages: ${results.standalone_pages.processed}/${results.standalone_pages.total} processed (${results.standalone_pages.created} created, ${results.standalone_pages.updated} updated, ${results.standalone_pages.errors} errors)`
        )
      }

      if (results.summary.content_types_synced.database_pages) {
        console.log(
          `Database Pages: ${results.database_pages.processed}/${results.database_pages.total} processed (${results.database_pages.created} created, ${results.database_pages.updated} updated, ${results.database_pages.errors} errors)`
        )
      }
    }

    // Show detailed results if verbose mode
    if (argv.verbose) {
      if (results.summary.content_types_synced.single_page) {
        console.log('\n--- Detailed Results ---')
        console.log(`Page ID: ${results.page_id}`)
        console.log(`Success: ${results.success}`)
        console.log(`Action: ${results.action || 'error'}`)
        if (results.entity_id) {
          console.log(`Entity ID: ${results.entity_id}`)
        }
        if (results.database_id) {
          console.log(`Database ID: ${results.database_id}`)
        }
        if (results.error) {
          console.log(`Error: ${results.error}`)
        }
      } else if (
        results.standalone_pages.details.length > 0 ||
        results.database_pages.details.length > 0
      ) {
        console.log('\n--- Detailed Results ---')

        if (results.standalone_pages.details.length > 0) {
          console.log('\nStandalone Pages:')
          results.standalone_pages.details.forEach((detail) => {
            console.log(
              `  ${detail.page_id}: ${detail.action}${detail.entity_id ? ` (${detail.entity_id})` : ''}${detail.error ? ` - ${detail.error}` : ''}`
            )
          })
        }

        if (results.database_pages.details.length > 0) {
          console.log('\nDatabase Pages:')
          results.database_pages.details.forEach((detail) => {
            console.log(
              `  ${detail.page_id} (DB: ${detail.database_id}): ${detail.action}${detail.entity_id ? ` (${detail.entity_id})` : ''}${detail.error ? ` - ${detail.error}` : ''}`
            )
          })
        }
      }
    }

    // Exit with appropriate code
    if (results.totals.errors > 0) {
      console.log(`\nCompleted with ${results.totals.errors} errors`)
      process.exit(1)
    } else {
      console.log('\nSync completed successfully!')
      process.exit(0)
    }
  } catch (error) {
    console.error('\nNotion sync failed:', error.message)

    // Show stack trace in debug mode
    if (process.env.DEBUG) {
      console.error(error.stack)
    }

    process.exit(1)
  }
}

if (isMain(import.meta.url)) {
  debug.enable(
    'sync-notion-entities,integrations:notion*,sync:*,embedded-index*,database:*,files:*'
  )
  main()
}
