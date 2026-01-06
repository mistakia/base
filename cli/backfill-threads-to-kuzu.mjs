#!/usr/bin/env node

/**
 * Backfill threads to KuzuDB
 *
 * Syncs all threads from filesystem to KuzuDB as entity nodes.
 * Useful for initial population or after schema changes.
 *
 * Usage:
 *   node cli/backfill-threads-to-kuzu.mjs           # Sync all threads
 *   node cli/backfill-threads-to-kuzu.mjs --dry-run # Preview without changes
 *   node cli/backfill-threads-to-kuzu.mjs --limit 10 # Sync first 10 threads
 */

import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import is_main from '#libs-server/utils/is-main.mjs'
import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'
import list_threads from '#libs-server/threads/list-threads.mjs'

const log = debug('cli:backfill-kuzu')

/**
 * Backfill threads to KuzuDB
 *
 * @param {Object} options
 * @param {boolean} [options.dry_run=false] - Preview without changes
 * @param {number} [options.limit=0] - Max threads to process (0 = unlimited)
 * @param {boolean} [options.verbose=false] - Verbose output
 * @returns {Promise<Object>} Sync statistics
 */
export async function backfill_threads_to_kuzu({
  dry_run = false,
  limit = 0,
  verbose = false
} = {}) {
  const stats = {
    total_found: 0,
    synced: 0,
    failed: 0,
    skipped: 0,
    start_time: Date.now(),
    errors: []
  }

  log('Starting thread backfill to KuzuDB')

  // Initialize the index manager
  await embedded_index_manager.initialize()

  if (!embedded_index_manager.is_kuzu_ready()) {
    throw new Error('KuzuDB is not available. Check configuration.')
  }

  // List all threads
  const threads = await list_threads({
    limit: Infinity,
    offset: 0
  })

  stats.total_found = threads.length
  log('Found %d threads', threads.length)

  // Apply limit
  const threads_to_process = limit > 0 ? threads.slice(0, limit) : threads

  if (dry_run) {
    log('[DRY RUN] Would sync %d threads to KuzuDB', threads_to_process.length)
    stats.skipped = threads_to_process.length
    stats.end_time = Date.now()
    return stats
  }

  // Sync each thread
  for (const thread of threads_to_process) {
    const result = await embedded_index_manager.sync_thread({
      thread_id: thread.thread_id,
      metadata: thread
    })

    if (result.success) {
      stats.synced++

      if (verbose && stats.synced % 50 === 0) {
        log('Synced %d threads', stats.synced)
      }
    } else {
      stats.failed++
      stats.errors.push({
        thread_id: thread.thread_id,
        error: 'Sync failed (kuzu: ' + result.kuzu_synced + ', duckdb: ' + result.duckdb_synced + ')'
      })
      log('Error syncing thread %s', thread.thread_id)
    }
  }

  stats.end_time = Date.now()
  stats.duration_ms = stats.end_time - stats.start_time

  log(
    'Backfill complete: %d synced, %d failed in %dms',
    stats.synced,
    stats.failed,
    stats.duration_ms
  )

  return stats
}

// CLI entry point
if (is_main(import.meta.url)) {
  debug.enable('cli:backfill-kuzu,embedded-index*')

  const argv = yargs(hideBin(process.argv))
    .scriptName('backfill-threads-to-kuzu')
    .usage('Sync all threads to KuzuDB.\n\nUsage: $0 [options]')
    .option('dry-run', {
      describe: 'Preview without making changes',
      type: 'boolean',
      default: false
    })
    .option('limit', {
      describe: 'Maximum threads to process (0 = unlimited)',
      type: 'number',
      default: 0
    })
    .option('verbose', {
      alias: 'v',
      describe: 'Verbose output',
      type: 'boolean',
      default: false
    })
    .strict()
    .help()
    .alias('help', 'h')
    .parseSync()

  const main = async () => {
    let exit_code = 0

    try {
      const stats = await backfill_threads_to_kuzu({
        dry_run: argv['dry-run'],
        limit: argv.limit,
        verbose: argv.verbose
      })

      console.log('\nBackfill complete:')
      console.log(`  Threads found: ${stats.total_found}`)
      console.log(`  Synced: ${stats.synced}`)
      console.log(`  Failed: ${stats.failed}`)
      console.log(`  Duration: ${stats.duration_ms}ms`)

      if (argv['dry-run']) {
        console.log('\n[DRY RUN] No changes were made')
      }

      if (stats.failed > 0) {
        exit_code = 1
        console.log('\nErrors:')
        for (const err of stats.errors.slice(0, 5)) {
          console.log(`  ${err.thread_id}: ${err.error}`)
        }
        if (stats.errors.length > 5) {
          console.log(`  ... and ${stats.errors.length - 5} more`)
        }
      }
    } catch (error) {
      console.error('Error:', error.message)
      exit_code = 1
    }

    await embedded_index_manager.shutdown()
    process.exit(exit_code)
  }

  main()
}

export default backfill_threads_to_kuzu
