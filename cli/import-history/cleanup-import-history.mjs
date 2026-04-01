#!/usr/bin/env bun

/**
 * Import History Cleanup Script
 *
 * Manages import history files by limiting retention per entity.
 * Supports both flat and nested directory structures with import sources (e.g., github).
 */

import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import config from '#config'
import {
  cleanup_import_history_files,
  get_cleanup_summary
} from '#libs-server/sync/cleanup-import-history-files.mjs'
import { list_import_history_files } from '#libs-server/sync/list-import-history-files.mjs'

const log = debug('cli:import-history:cleanup')

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
  .option('external-system', {
    describe: 'Filter by external system (e.g., github)',
    type: 'string'
  })
  .option('entity-id', {
    describe: 'Process specific entity ID only',
    type: 'string'
  })
  .option('keep-count', {
    describe: 'Number of import files to keep per entity',
    type: 'number',
    default: 10
  })
  .option('dry-run', {
    describe: 'Show what would be deleted without actually deleting',
    type: 'boolean',
    default: false
  })
  .option('force', {
    describe: 'Skip confirmation prompt',
    type: 'boolean',
    default: false
  })
  .option('summary', {
    describe: 'Show summary statistics only (no cleanup)',
    type: 'boolean',
    default: false
  })
  .option('list', {
    describe: 'List import history files only (no cleanup)',
    type: 'boolean',
    default: false
  })
  .option('verbose', {
    describe: 'Enable verbose logging',
    type: 'boolean',
    default: false
  })
  .help()
  .example(
    '$0 --external-system github --keep-count 5',
    'Keep 5 most recent files for GitHub entities'
  )
  .example(
    '$0 --entity-id abc123 --external-system github --dry-run',
    'Preview cleanup for specific entity'
  )
  .example(
    '$0 --summary',
    'Show cleanup statistics without performing cleanup'
  ).argv

if (argv.verbose) {
  debug.enable('cli:import-history:cleanup')
}

// Utility functions
function format_bytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

// Display functions
function display_summary(summary) {
  console.log('Import History Summary:\n')
  console.log(`Total entities: ${summary.entities_total}`)
  console.log(
    `Entities with excess files: ${summary.entities_with_excess_files}`
  )
  console.log(`Total files: ${summary.total_files}`)
  console.log(`Files to delete: ${summary.files_to_delete}`)
  console.log(`Total storage: ${format_bytes(summary.bytes_total)}`)
  console.log(`Storage to free: ${format_bytes(summary.bytes_to_free)}`)

  if (Object.keys(summary.by_system).length > 0) {
    console.log('\nBy External System:')
    console.log('─'.repeat(50))
    for (const [system, stats] of Object.entries(summary.by_system)) {
      console.log(`\n${system}:`)
      console.log(`  Entities: ${stats.entities}`)
      console.log(`  Total files: ${stats.total_files}`)
      console.log(`  Files to delete: ${stats.files_to_delete}`)
      console.log(`  Storage to free: ${format_bytes(stats.bytes_to_free)}`)
    }
  }
}

function display_entity_list(entities) {
  console.log(`Import History Entities (${entities.length}):\n`)

  // Group by external system and import source
  const grouped = {}
  for (const entity of entities) {
    const key = `${entity.external_system}${entity.import_source ? `:${entity.import_source}` : ''}`
    if (!grouped[key]) {
      grouped[key] = []
    }
    grouped[key].push(entity)
  }

  for (const [key, system_entities] of Object.entries(grouped)) {
    const [system, import_source] = key.includes(':')
      ? key.split(':')
      : [key, null]
    const label = import_source ? `${system} (${import_source})` : system
    console.log(`\n${label} (${system_entities.length} entities)`)
    console.log('─'.repeat(50))

    for (const entity of system_entities) {
      console.log(`\nEntity ID: ${entity.entity_id}`)
      if (entity.import_source) {
        console.log(`  Import source: ${entity.import_source}`)
      }
      console.log(`  Directory: ${entity.entity_import_directory}`)
      console.log(`  Raw files: ${entity.raw_files.length}`)
      console.log(`  Processed files: ${entity.processed_files.length}`)
      console.log(`  Total files: ${entity.total_files}`)

      if (entity.raw_files.length > 0) {
        const latest = entity.raw_files[0]
        console.log(
          `  Latest raw: ${latest.filename} (${format_bytes(latest.size)})`
        )
      }

      if (entity.processed_files.length > 0) {
        const latest = entity.processed_files[0]
        console.log(
          `  Latest processed: ${latest.filename} (${format_bytes(latest.size)})`
        )
      }
    }
  }
}

function display_results(results) {
  console.log('\nCleanup Results:')
  console.log('─'.repeat(50))
  console.log(`Entities processed: ${results.entities_processed}`)
  console.log(`Raw files deleted: ${results.raw_files_deleted}`)
  console.log(`Processed files deleted: ${results.processed_files_deleted}`)
  console.log(`Total files deleted: ${results.total_files_deleted}`)
  console.log(`Storage freed: ${format_bytes(results.bytes_freed)}`)

  if (results.errors.length > 0) {
    console.log(`\nErrors (${results.errors.length}):`)
    for (const error of results.errors) {
      console.log(`  ${error}`)
    }
  }

  if (argv['dry-run']) {
    console.log('\nThis was a dry run. No files were actually deleted.')
  }
}

async function confirm_cleanup(summary) {
  if (argv.force) {
    return true
  }

  if (summary.files_to_delete === 0) {
    console.log('\nNo files need to be deleted.')
    return false
  }

  console.log(
    `\nThis will delete ${summary.files_to_delete} files and free ${format_bytes(summary.bytes_to_free)} of storage.`
  )

  if (!argv['dry-run']) {
    console.log('This action cannot be undone.')
  }

  console.log('\nPress Enter to continue or Ctrl+C to cancel...')

  return new Promise((resolve) => {
    process.stdin.once('data', () => {
      resolve(true)
    })
  })
}

function validate_arguments() {
  if (argv['entity-id'] && !argv['external-system']) {
    console.error(
      'Error: --entity-id requires --external-system to be specified'
    )
    process.exit(1)
  }

  if (argv['keep-count'] < 0) {
    console.error('Error: --keep-count must be a non-negative number')
    process.exit(1)
  }

  if (argv.summary && argv.list) {
    console.error('Error: Cannot use both --summary and --list options')
    process.exit(1)
  }
}

// Main execution
async function main() {
  try {
    log('Starting import history cleanup script')
    validate_arguments()

    const options = {
      external_system: argv['external-system'],
      entity_id: argv['entity-id'],
      keep_count: argv['keep-count'],
      import_history_base_directory: config.user_base_directory
        ? `${config.user_base_directory}/import-history`
        : null
    }

    log('Analyzing import history with options:', options)
    console.log('Analyzing import history...')

    if (argv.list) {
      const entities = await list_import_history_files(options)
      display_entity_list(entities)
      return
    }

    if (argv.summary) {
      const summary = await get_cleanup_summary(options)
      display_summary(summary)
      return
    }

    // Get summary for confirmation
    const summary = await get_cleanup_summary(options)
    display_summary(summary)

    // Confirm cleanup
    const confirmed = await confirm_cleanup(summary)
    if (!confirmed) {
      console.log('\nCleanup cancelled.')
      return
    }

    // Perform cleanup
    console.log('\nCleaning up import history files...')
    const results = await cleanup_import_history_files({
      ...options,
      dry_run: argv['dry-run']
    })

    display_results(results)

    if (results.total_files_deleted > 0 && !argv['dry-run']) {
      console.log('\nCleanup completed successfully!')
    }
  } catch (error) {
    console.error('\nError during cleanup:', error.message)
    if (argv.verbose) {
      console.error(error.stack)
    }
    process.exit(1)
  }
}

main()
