#!/usr/bin/env node

/**
 * @fileoverview CLI script to rebuild the embedded database index
 *
 * This script drops and recreates the DuckDB and Kuzu schemas,
 * then repopulates them with all threads and tasks from the filesystem.
 *
 * Usage:
 *   yarn rebuild:index
 *   node cli/rebuild-embedded-index.mjs
 */

import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import is_main from '#libs-server/utils/is-main.mjs'
import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'
import list_threads from '#libs-server/threads/list-threads.mjs'
import { list_entity_files_from_filesystem } from '#libs-server/repository/filesystem/list-entity-files-from-filesystem.mjs'

const log = debug('cli:rebuild-index')

/**
 * Rebuild the embedded database index
 *
 * @param {Object} options - Options
 * @param {boolean} [options.threads_only=false] - Only rebuild threads
 * @param {boolean} [options.tasks_only=false] - Only rebuild tasks
 * @param {boolean} [options.verbose=false] - Verbose output
 * @returns {Promise<Object>} Rebuild statistics
 */
export async function rebuild_embedded_index({
  threads_only = false,
  tasks_only = false,
  verbose = false
} = {}) {
  const stats = {
    threads_synced: 0,
    threads_failed: 0,
    tasks_synced: 0,
    tasks_failed: 0,
    start_time: Date.now(),
    end_time: null
  }

  log('Starting embedded index rebuild')

  // Initialize the index manager
  await embedded_index_manager.initialize()

  if (!embedded_index_manager.is_ready()) {
    throw new Error(
      'Embedded index manager failed to initialize. Check configuration.'
    )
  }

  // Drop and recreate schemas
  log('Dropping and recreating schemas')
  await embedded_index_manager.rebuild_full_index()

  // Sync threads
  if (!tasks_only) {
    log('Syncing threads to index')

    try {
      const threads = await list_threads({
        limit: Infinity,
        offset: 0
      })

      log(`Found ${threads.length} threads to sync`)

      for (const thread of threads) {
        try {
          await embedded_index_manager.sync_thread({
            thread_id: thread.thread_id,
            metadata: thread
          })
          stats.threads_synced++

          if (verbose && stats.threads_synced % 100 === 0) {
            log(`Synced ${stats.threads_synced} threads`)
          }
        } catch (error) {
          log(`Failed to sync thread ${thread.thread_id}: ${error.message}`)
          stats.threads_failed++
        }
      }

      log(
        `Threads sync complete: ${stats.threads_synced} synced, ${stats.threads_failed} failed`
      )
    } catch (error) {
      log(`Error listing threads: ${error.message}`)
      throw error
    }
  }

  // Sync tasks/entities
  if (!threads_only) {
    log('Syncing tasks to index')

    try {
      const entities = await list_entity_files_from_filesystem({
        entity_type: 'task'
      })

      log(`Found ${entities.length} tasks to sync`)

      for (const entity of entities) {
        try {
          await embedded_index_manager.sync_entity({
            base_uri: entity.base_uri,
            entity_data: entity
          })
          stats.tasks_synced++

          if (verbose && stats.tasks_synced % 100 === 0) {
            log(`Synced ${stats.tasks_synced} tasks`)
          }
        } catch (error) {
          log(`Failed to sync task ${entity.base_uri}: ${error.message}`)
          stats.tasks_failed++
        }
      }

      log(
        `Tasks sync complete: ${stats.tasks_synced} synced, ${stats.tasks_failed} failed`
      )
    } catch (error) {
      log(`Error listing tasks: ${error.message}`)
      throw error
    }
  }

  stats.end_time = Date.now()
  stats.duration_ms = stats.end_time - stats.start_time

  log('Index rebuild complete in %dms', stats.duration_ms)

  return stats
}

// CLI entry point
if (is_main(import.meta.url)) {
  debug.enable('cli:rebuild-index,embedded-index*')

  const argv = yargs(hideBin(process.argv))
    .scriptName('rebuild-embedded-index')
    .usage('Rebuild the embedded database index.\n\nUsage: $0 [options]')
    .option('threads-only', {
      describe: 'Only rebuild threads index',
      type: 'boolean',
      default: false
    })
    .option('tasks-only', {
      describe: 'Only rebuild tasks index',
      type: 'boolean',
      default: false
    })
    .option('verbose', {
      alias: 'v',
      describe: 'Verbose output',
      type: 'boolean',
      default: false
    })
    .check((argv) => {
      if (argv['threads-only'] && argv['tasks-only']) {
        throw new Error('Cannot use both --threads-only and --tasks-only')
      }
      return true
    })
    .strict()
    .help()
    .alias('help', 'h')
    .parseSync()

  const main = async () => {
    let exit_code = 0

    try {
      const stats = await rebuild_embedded_index({
        threads_only: argv['threads-only'],
        tasks_only: argv['tasks-only'],
        verbose: argv.verbose
      })

      console.log('\nIndex rebuild complete:')
      console.log(`  Threads synced: ${stats.threads_synced}`)
      console.log(`  Threads failed: ${stats.threads_failed}`)
      console.log(`  Tasks synced: ${stats.tasks_synced}`)
      console.log(`  Tasks failed: ${stats.tasks_failed}`)
      console.log(`  Duration: ${stats.duration_ms}ms`)

      if (stats.threads_failed > 0 || stats.tasks_failed > 0) {
        exit_code = 1
      }
    } catch (error) {
      console.error('Error rebuilding index:', error.message)
      exit_code = 1
    }

    // Shutdown the index manager
    await embedded_index_manager.shutdown()
    process.exit(exit_code)
  }

  main()
}

export default rebuild_embedded_index
