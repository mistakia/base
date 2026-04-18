/**
 * Resync Full Index
 *
 * Update-in-place full index resync without dropping tables.
 * Scans filesystem, upserts all entities, then removes orphans.
 * Index remains queryable throughout the entire operation.
 */

import debug from 'debug'

import config from '#config'
import { stream_entity_file_chunks } from './stream-entity-files.mjs'
import {
  execute_sqlite_query,
  checkpoint_sqlite
} from '#libs-server/embedded-database-index/sqlite/sqlite-database-client.mjs'
import {
  set_index_metadata,
  set_repo_sync_state,
  INDEX_METADATA_KEYS,
  CURRENT_SCHEMA_VERSION
} from '#libs-server/embedded-database-index/sqlite/sqlite-metadata-operations.mjs'
import {
  discover_repositories,
  get_repository_head_sha
} from './repository-discovery.mjs'
import { ENTITY_DIRECTORIES } from './index-sync-filters.mjs'
import {
  list_thread_ids,
  process_threads_in_batches
} from '#libs-server/threads/list-threads.mjs'

const log = debug('embedded-index:sync:resync')

/** Collect all entity base_uris from the index database */
async function collect_database_entity_base_uris() {
  log('Collecting database entity base_uris')
  const results = await execute_sqlite_query({
    query: 'SELECT base_uri FROM entities'
  })
  const database_uris = new Set(results.map((row) => row.base_uri))
  log('Found %d entities in database', database_uris.size)
  return database_uris
}

/** Collect all thread IDs from the index database */
async function collect_database_thread_ids() {
  log('Collecting database thread IDs')
  const results = await execute_sqlite_query({
    query: 'SELECT thread_id FROM threads'
  })
  const thread_ids = new Set(results.map((row) => row.thread_id))
  log('Found %d threads in database', thread_ids.size)
  return thread_ids
}

/** Identify orphans: items in database but not in filesystem */
function identify_orphans({ filesystem_items, database_items, label }) {
  const orphans = Array.from(database_items).filter(
    (item) => !filesystem_items.has(item)
  )
  log('Identified %d orphan %s', orphans.length, label)
  return orphans
}

/** Delete orphan items from database */
async function delete_orphans({ orphan_ids, remove_fn, label }) {
  log('Deleting %d orphan %ss', orphan_ids.length, label)
  let deleted = 0
  for (const id of orphan_ids) {
    try {
      await remove_fn(id)
      deleted++
    } catch (error) {
      log('Error deleting orphan %s %s: %s', label, id, error.message)
    }
  }
  return deleted
}

/**
 * Main entry point for full resync with orphan cleanup
 * @param {Object} params
 * @param {Object} params.index_manager - Embedded index manager instance
 * @returns {Promise<Object>} Resync result with stats
 */
export async function resync_full_index({ index_manager }) {
  const user_base_directory = config.user_base_directory

  log('Starting full resync for %s', user_base_directory)

  const stats = {
    entities_synced: 0,
    entities_failed: 0,
    entities_orphans_removed: 0,
    threads_synced: 0,
    threads_failed: 0,
    threads_orphans_removed: 0,
    failed_entity_uris: []
  }

  try {
    // Phase 1: Stream and sync all entities from filesystem
    // Streams entities in chunks to avoid loading all into memory at once.
    // Collects base_uri strings (not full objects) for orphan detection.
    log('Phase 1: Streaming entities from filesystem')

    const filesystem_entity_uris = new Set()

    for await (const chunk of stream_entity_file_chunks({
      entity_directories: ENTITY_DIRECTORIES
    })) {
      for (const entity of chunk) {
        const base_uri =
          entity.entity_properties?.base_uri || entity.file_info?.base_uri

        if (!base_uri) {
          continue
        }

        // Collect URI for orphan detection (strings only, much smaller than full objects)
        filesystem_entity_uris.add(base_uri)

        try {
          const result = await index_manager.sync_entity({
            base_uri,
            entity_data: entity.entity_properties,
            skip_ipc: true
          })

          if (result.success) {
            stats.entities_synced++
          } else {
            stats.entities_failed++
            stats.failed_entity_uris.push(base_uri)
          }
        } catch (error) {
          log('Error syncing entity %s: %s', base_uri, error.message)
          stats.entities_failed++
          stats.failed_entity_uris.push(`${base_uri} (${error.message})`)
        }
      }
    }

    log('Streamed and synced %d entities', filesystem_entity_uris.size)

    // Phase 2: Sync all threads from filesystem using batched processing
    log('Phase 2: Syncing threads from filesystem')

    const thread_ids = await list_thread_ids()
    log('Found %d threads to sync', thread_ids.length)

    // Thread IDs are the filesystem set for orphan detection
    const filesystem_thread_ids = new Set(thread_ids)

    const { synced, failed, failed_thread_ids } =
      await process_threads_in_batches({
        thread_ids,
        sync_fn: ({ thread_id, metadata }) =>
          index_manager.sync_thread({ thread_id, metadata }),
        options: {
          log_fn: log,
          progress_label: 'Thread sync'
        }
      })

    stats.threads_synced = synced
    stats.threads_failed = failed
    stats.failed_thread_ids = failed_thread_ids

    // Phase 3: Remove orphan entities
    log('Phase 3: Removing orphan entities')

    const database_entity_uris = await collect_database_entity_base_uris()
    const orphan_entity_uris = identify_orphans({
      filesystem_items: filesystem_entity_uris,
      database_items: database_entity_uris,
      label: 'entities'
    })

    if (orphan_entity_uris.length > 0) {
      stats.entities_orphans_removed = await delete_orphans({
        orphan_ids: orphan_entity_uris,
        remove_fn: (base_uri) => index_manager.remove_entity({ base_uri }),
        label: 'entity'
      })
    }

    // Phase 4: Remove orphan threads
    log('Phase 4: Removing orphan threads')

    const database_thread_ids = await collect_database_thread_ids()
    const orphan_thread_ids = identify_orphans({
      filesystem_items: filesystem_thread_ids,
      database_items: database_thread_ids,
      label: 'threads'
    })

    if (orphan_thread_ids.length > 0) {
      stats.threads_orphans_removed = await delete_orphans({
        orphan_ids: orphan_thread_ids,
        remove_fn: (thread_id) => index_manager.remove_thread({ thread_id }),
        label: 'thread'
      })
    }

    // Update sync metadata for all repositories (main + submodules)
    let metadata_updated = false
    try {
      const repositories = await discover_repositories({
        repo_path: user_base_directory
      })

      const new_sync_state = {}
      for (const repo of repositories) {
        try {
          const sha = await get_repository_head_sha({ repo_path: repo.path })
          new_sync_state[repo.relative_path] = { sha }
        } catch (error) {
          log(
            'Failed to get HEAD for %s: %s',
            repo.relative_path,
            error.message
          )
        }
      }

      await set_repo_sync_state({ state: new_sync_state })
      await set_index_metadata({
        key: INDEX_METADATA_KEYS.SCHEMA_VERSION,
        value: CURRENT_SCHEMA_VERSION
      })
      // Clear rebuild_in_progress flag if it was set by an interrupted rebuild
      await set_index_metadata({
        key: INDEX_METADATA_KEYS.REBUILD_IN_PROGRESS,
        value: 'false'
      })
      // Force checkpoint to persist metadata
      await checkpoint_sqlite()
      metadata_updated = true
    } catch (metadata_error) {
      log('Error updating sync metadata: %s', metadata_error.message)
      // Metadata failure is tracked but doesn't fail the overall sync
      // Next startup will re-sync, which is acceptable behavior
    }

    const total_failed = stats.entities_failed + stats.threads_failed
    const total_synced = stats.entities_synced + stats.threads_synced

    log(
      'Full resync complete: %d entities synced, %d orphans removed, %d threads synced, %d thread orphans removed, %d failed, metadata_updated: %s',
      stats.entities_synced,
      stats.entities_orphans_removed,
      stats.threads_synced,
      stats.threads_orphans_removed,
      total_failed,
      metadata_updated
    )

    if (total_failed > 0) {
      log(
        'Warning: %d items failed during resync (entity-level data issues, not infrastructure)',
        total_failed
      )
    }

    // Unconditional summary line so the aggregate is visible in pm2 logs
    // regardless of the active DEBUG namespace.
    console.error(
      '[resync-summary] entities_synced=%d entities_failed=%d threads_synced=%d threads_failed=%d entity_orphans_removed=%d thread_orphans_removed=%d metadata_updated=%s',
      stats.entities_synced,
      stats.entities_failed,
      stats.threads_synced,
      stats.threads_failed,
      stats.entities_orphans_removed,
      stats.threads_orphans_removed,
      metadata_updated
    )

    const sample_failures = (list) => {
      const sample = list.slice(0, 20).join(', ')
      const overflow = list.length - 20
      return overflow > 0 ? `${sample} (...${overflow} more)` : sample
    }
    if (stats.failed_entity_uris && stats.failed_entity_uris.length > 0) {
      console.warn(
        '[resync-summary] failed_entities=%s',
        sample_failures(stats.failed_entity_uris)
      )
    }
    if (stats.failed_thread_ids && stats.failed_thread_ids.length > 0) {
      console.warn(
        '[resync-summary] failed_threads=%s',
        sample_failures(stats.failed_thread_ids)
      )
    }

    // Individual entity/thread sync failures (bad YAML, missing fields,
    // constraint violations) are data-level issues that should not block
    // the overall resync from succeeding. Only infrastructure-level failures
    // (database unavailable, filesystem errors) should cause resync failure.
    // A resync that synced zero items but also had failures likely indicates
    // a systemic problem, so treat that as a failure.
    return {
      success: total_synced > 0 || total_failed === 0,
      method: 'resync',
      stats,
      metadata_updated
    }
  } catch (error) {
    log('Full resync failed: %s', error.message)
    return {
      success: false,
      method: 'resync',
      error: error.message,
      stats
    }
  }
}
