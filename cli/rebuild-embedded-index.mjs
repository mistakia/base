#!/usr/bin/env bun

/**
 * @fileoverview CLI script to rebuild the embedded database index
 *
 * Drops and recreates the SQLite schema, repopulates entities and threads
 * from the filesystem, then runs an explicit thread_timeline backfill pass.
 *
 * The backfill is restartable: it iterates every thread directory on each
 * run and DELETE+INSERTs rows, so it is safe to re-run from scratch without
 * any checkpoint file.
 *
 * Usage:
 *   bun rebuild:index
 *   bun cli/rebuild-embedded-index.mjs
 */

import debug from 'debug'

import config from '#config'
import is_main from '#libs-server/utils/is-main.mjs'
import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'
import { sync_all_thread_timelines } from '#libs-server/embedded-database-index/sync/sync-thread-timeline.mjs'

const log = debug('cli:rebuild-index')

/**
 * Rebuild the embedded database index
 *
 * @param {Object} [options]
 * @param {number} [options.timeline_batch_size=50] - Threads per progress log
 * @returns {Promise<void>}
 */
export async function rebuild_embedded_index({
  timeline_batch_size = 50
} = {}) {
  log('Starting embedded index rebuild')

  // Initialize the index manager
  await embedded_index_manager.initialize()

  if (!embedded_index_manager.is_ready()) {
    throw new Error(
      'Embedded index manager failed to initialize. Check configuration.'
    )
  }

  // Drop and recreate schemas, then repopulate from filesystem
  log('Dropping and recreating schemas')
  await embedded_index_manager.reset_and_rebuild_index()

  // Explicit thread_timeline backfill. This is belt-and-suspenders: the
  // per-thread sync already ran during reset_and_rebuild_index, but this
  // second pass guarantees every thread with a timeline file on disk is
  // represented, independent of the manager's in-memory cache state.
  log('Backfilling thread_timeline')
  const timeline_stats = await sync_all_thread_timelines({
    user_base_directory: config.user_base_directory,
    batch_size: timeline_batch_size,
    on_progress: ({ processed, total }) => {
      log('thread_timeline backfill: processed %d / %d', processed, total)
      console.log(`thread_timeline backfill: processed ${processed} / ${total}`)
    }
  })
  log(
    'thread_timeline backfill complete: %d synced, %d failed (of %d total)',
    timeline_stats.synced,
    timeline_stats.failed,
    timeline_stats.total
  )

  log('Index rebuild complete')
}

// CLI entry point
if (is_main(import.meta.url)) {
  debug.enable('cli:rebuild-index,embedded-index*')

  const main = async () => {
    let exit_code = 0

    try {
      await rebuild_embedded_index()
      console.log('\nIndex rebuild complete')
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
