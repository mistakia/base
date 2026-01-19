/**
 * Resync Full Index
 *
 * Update-in-place full index resync without dropping tables.
 * Scans filesystem, upserts all entities, then removes orphans.
 * Index remains queryable throughout the entire operation.
 */

import debug from 'debug'

import config from '#config'
import { list_entity_files_from_filesystem } from '#libs-server/repository/filesystem/list-entity-files-from-filesystem.mjs'
import { execute_duckdb_query } from '../duckdb/duckdb-database-client.mjs'
import {
  set_index_metadata,
  set_repo_sync_state,
  INDEX_METADATA_KEYS,
  CURRENT_SCHEMA_VERSION
} from '../duckdb/duckdb-metadata-operations.mjs'
import {
  discover_repositories,
  get_repository_head_sha
} from './repository-discovery.mjs'
import { ENTITY_DIRECTORIES } from './sync-constants.mjs'
import list_threads from '#libs-server/threads/list-threads.mjs'

const log = debug('embedded-index:sync:resync')

/** Collect all entity base_uris from DuckDB */
async function collect_database_entity_base_uris() {
  log('Collecting database entity base_uris')
  const results = await execute_duckdb_query({
    query: 'SELECT base_uri FROM entities'
  })
  const database_uris = new Set(results.map((row) => row.base_uri))
  log('Found %d entities in database', database_uris.size)
  return database_uris
}

/** Collect all thread IDs from DuckDB */
async function collect_database_thread_ids() {
  log('Collecting database thread IDs')
  const results = await execute_duckdb_query({
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
    threads_orphans_removed: 0
  }

  try {
    // Phase 1: Sync all entities from filesystem
    log('Phase 1: Syncing entities from filesystem')

    const entities = await list_entity_files_from_filesystem({
      include_entity_types: ENTITY_DIRECTORIES
    })

    log('Found %d entities to sync', entities.length)

    // Collect all filesystem URIs BEFORE syncing to ensure orphan detection
    // is based on filesystem presence, not sync success. This prevents
    // data loss when entities fail to sync due to transient errors.
    const filesystem_entity_uris = new Set()
    for (const entity of entities) {
      const base_uri =
        entity.entity_properties?.base_uri || entity.file_info?.base_uri
      if (base_uri) {
        filesystem_entity_uris.add(base_uri)
      }
    }

    // Now sync each entity
    for (const entity of entities) {
      const base_uri =
        entity.entity_properties?.base_uri || entity.file_info?.base_uri

      if (!base_uri) {
        continue
      }

      try {
        const result = await index_manager.sync_entity({
          base_uri,
          entity_data: entity.entity_properties
        })

        if (result.success) {
          stats.entities_synced++
        } else {
          stats.entities_failed++
        }
      } catch (error) {
        log('Error syncing entity %s: %s', base_uri, error.message)
        stats.entities_failed++
      }
    }

    // Phase 2: Sync all threads from filesystem
    // KNOWN LIMITATION: Loads all threads into memory at once.
    // Current expected usage: <5000 threads typical, ~1KB per thread = ~5MB.
    // If memory becomes an issue with very large datasets:
    //   - Prefer incremental sync (handles typical operations efficiently)
    //   - For full resync, implement batched processing with list_threads pagination
    log('Phase 2: Syncing threads from filesystem')

    const THREAD_COUNT_WARNING_THRESHOLD = 10000
    const threads = await list_threads({
      limit: Infinity,
      offset: 0
    })

    if (threads.length > THREAD_COUNT_WARNING_THRESHOLD) {
      log(
        'WARNING: Large thread count (%d) may cause memory pressure. Consider using incremental sync instead.',
        threads.length
      )
    }

    log('Found %d threads to sync', threads.length)

    // Collect all filesystem thread IDs BEFORE syncing (same rationale as entities)
    const filesystem_thread_ids = new Set()
    for (const thread of threads) {
      if (thread.thread_id) {
        filesystem_thread_ids.add(thread.thread_id)
      }
    }

    // Now sync each thread
    for (const thread of threads) {
      if (!thread.thread_id) {
        continue
      }

      try {
        const result = await index_manager.sync_thread({
          thread_id: thread.thread_id,
          metadata: thread
        })

        if (result.success) {
          stats.threads_synced++
        } else {
          stats.threads_failed++
        }
      } catch (error) {
        log('Error syncing thread %s: %s', thread.thread_id, error.message)
        stats.threads_failed++
      }
    }

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
      metadata_updated = true
    } catch (metadata_error) {
      log('Error updating sync metadata: %s', metadata_error.message)
      // Metadata failure is tracked but doesn't fail the overall sync
      // Next startup will re-sync, which is acceptable behavior
    }

    const total_failed = stats.entities_failed + stats.threads_failed

    log(
      'Full resync complete: %d entities synced, %d orphans removed, %d threads synced, %d thread orphans removed, %d failed, metadata_updated: %s',
      stats.entities_synced,
      stats.entities_orphans_removed,
      stats.threads_synced,
      stats.threads_orphans_removed,
      total_failed,
      metadata_updated
    )

    return {
      success: total_failed === 0,
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
