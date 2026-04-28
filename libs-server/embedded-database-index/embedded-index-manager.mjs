/**
 * Embedded Index Manager
 *
 * Singleton that coordinates SQLite database for index operations.
 * Handles initialization, sync, rebuild, and shutdown.
 */

import fs from 'fs/promises'
import fs_sync from 'fs'
import path from 'path'
import debug from 'debug'

import config from '#config'
import {
  close_sqlite_connection,
  initialize_sqlite_client,
  execute_sqlite_query,
  execute_sqlite_run,
  checkpoint_sqlite,
  with_sqlite_reader,
  is_sqlite_initialized,
  register_default_sqlite_path
} from './sqlite/sqlite-database-client.mjs'
import {
  create_sqlite_schema,
  drop_sqlite_schema
} from './sqlite/sqlite-schema-definitions.mjs'
import {
  upsert_thread_to_sqlite,
  upsert_entity_to_sqlite,
  delete_thread_from_sqlite,
  delete_entity_from_sqlite,
  sync_entity_tags_to_sqlite,
  sync_entity_relations_to_sqlite,
  sync_entity_aliases_to_sqlite,
  sync_entity_content_wikilinks_to_sqlite,
  sync_thread_references_to_sqlite,
  sync_thread_tags_to_sqlite,
  upsert_entities_batch,
  sync_entities_tags_batch,
  sync_entities_relations_batch,
  sync_entities_aliases_batch,
  sync_entities_content_wikilinks_batch,
  BATCH_CHUNK_SIZE
} from './sqlite/sqlite-entity-sync.mjs'
import {
  extract_unified_entity_data,
  extract_tags_from_entity,
  extract_relations_from_entity,
  extract_aliases_from_entity,
  extract_content_wikilinks_from_entity_metadata
} from './sync/entity-data-extractor.mjs'
import {
  extract_thread_index_data,
  extract_thread_reference_targets,
  read_and_extract_latest_event
} from './sync/thread-data-extractor.mjs'
import { sync_index_on_startup } from './sync/incremental-sync.mjs'
import { backfill_git_activity_from_scratch } from './sync/sync-git-activity.mjs'
import { resync_full_index } from './sync/resync-full-index.mjs'
import { migrate_to_v8 } from './sqlite/migrations/migrate-to-v8.mjs'
import {
  sync_thread_timeline,
  delete_thread_timeline
} from './sync/sync-thread-timeline.mjs'
import {
  get_index_metadata,
  set_index_metadata,
  set_repo_sync_state,
  INDEX_METADATA_KEYS,
  CURRENT_SCHEMA_VERSION
} from './sqlite/sqlite-metadata-operations.mjs'
import sqlite_backend from './backends/sqlite/index.mjs'
import { ENTITY_DIRECTORIES } from './sync/index-sync-filters.mjs'
import {
  discover_repositories,
  get_repository_head_sha
} from './sync/repository-discovery.mjs'
import {
  list_thread_ids,
  process_threads_in_batches
} from '#libs-server/threads/list-threads.mjs'
import { get_thread_base_directory } from '#libs-server/threads/threads-constants.mjs'
import { stream_entity_file_chunks } from './sync/stream-entity-files.mjs'
import { write_entity_change_notification } from './sync/entity-change-ipc.mjs'

const log = debug('embedded-index')

class EmbeddedIndexManager {
  constructor() {
    this.initialized = false
    this.sqlite_ready = false
    this.index_config = null
    this.sync_in_progress = false
    this._sync_lock_queue = []
    // Map of thread_id -> { metadata, callbacks: [{ resolve, reject }] }
    // Used to coalesce repeated sync requests for the same thread
    this._pending_thread_syncs = new Map()
    // Map of thread_id -> { size: number, mtime: number, event_data: Object }
    // Caches timeline extraction results keyed by file size + mtime to skip
    // re-extraction when only metadata changes.
    // Cleared on rebuild and shutdown; evicts oldest entries when exceeding cap.
    this._timeline_sync_cache = new Map()
    this._timeline_cache_max_size = 200

    this._backend = sqlite_backend

    // Metrics collector (set externally via set_metrics)
    this._metrics = null
  }

  /**
   * Set the metrics collector instance.
   * @param {Object} metrics - Metrics collector from create_sync_metrics
   */
  set_metrics(metrics) {
    this._metrics = metrics
  }

  /**
   * Acquire sync lock to prevent concurrent sync operations.
   * Returns a release function that must be called when done.
   *
   * Uses a simple queue-based lock. When released, if there are waiters,
   * the lock is directly transferred (sync_in_progress stays true).
   * Only when no waiters remain does sync_in_progress become false.
   *
   * THREAD SAFETY: The check-then-set pattern (lines below) is safe because
   * JavaScript is single-threaded. No await exists between the check and set,
   * so no interleaving can occur. The event loop only yields at await points.
   *
   * @returns {Promise<Function>} Release function
   */
  async _acquire_sync_lock() {
    // Safe: synchronous check-and-set, no await between these two lines
    if (!this.sync_in_progress) {
      this.sync_in_progress = true
      log('Sync lock acquired')
      return this._create_release_function()
    }

    // Wait in queue for lock to be released
    return new Promise((resolve) => {
      log('Waiting for sync lock')
      this._sync_lock_queue.push(() => {
        // Lock is transferred directly - sync_in_progress is already true
        log('Sync lock acquired (from queue)')
        resolve(this._create_release_function())
      })
    })
  }

  /**
   * Create a release function for the sync lock.
   * Transfers lock to next waiter or releases if none waiting.
   */
  _create_release_function() {
    return () => {
      if (this._sync_lock_queue.length > 0) {
        // Transfer lock directly to next waiter (don't release)
        log('Sync lock transferred to next waiter')
        const next = this._sync_lock_queue.shift()
        next()
      } else {
        // No waiters, release the lock
        this.sync_in_progress = false
        log('Sync lock released')
      }
    }
  }

  get_index_config() {
    if (this.index_config) {
      return this.index_config
    }

    const user_base_directory = config.user_base_directory
    const embedded_config = config.embedded_database_index || {}

    this.index_config = {
      enabled: embedded_config.enabled !== false,
      sqlite_path:
        embedded_config.sqlite_path ||
        `${user_base_directory}/embedded-database-index/sqlite.db`,
      file_watcher_enabled: embedded_config.file_watcher_enabled !== false
    }

    // Make the SQLite path available to the read-only fallback in
    // sqlite-database-client so reader-only processes (base-api) can serve
    // queries without the manager being initialized in-process.
    register_default_sqlite_path({
      database_path: this.index_config.sqlite_path
    })

    return this.index_config
  }

  async initialize() {
    if (this.initialized) {
      log('Index manager already initialized')
      return
    }

    const index_config = this.get_index_config()

    if (!index_config.enabled) {
      log('Embedded database index is disabled')
      return
    }

    log('Initializing embedded index manager')

    try {
      await this._initialize_sqlite(index_config)
      this.sqlite_ready = true
      log('SQLite database initialized')
    } catch (error) {
      log('Failed to initialize SQLite: %s', error.message)
      this.sqlite_ready = false
    }

    this.initialized = true

    if (this.sqlite_ready) {
      await this._perform_startup_sync()
    }

    log('Embedded index manager initialized (sqlite: %s)', this.sqlite_ready)
  }

  async _initialize_sqlite(index_config) {
    await initialize_sqlite_client({
      database_path: index_config.sqlite_path
    })

    await create_sqlite_schema()
  }

  _with_reader(fn) {
    // When a writer handle is already open in this process (index-sync-service
    // and tests), reuse it directly -- opening a second handle against
    // :memory: is impossible, and against a file-backed DB adds pointless
    // overhead. The stale-read race this helper addresses only affects
    // reader-only processes like base-api, where no module-level handle exists.
    if (is_sqlite_initialized()) {
      return fn()
    }
    const { sqlite_path } = this.get_index_config()
    return with_sqlite_reader({ database_path: sqlite_path }, fn)
  }

  // Like _with_reader, but returns default_value when the sqlite file does
  // not exist and no writer handle is open. Used by read-only aggregation
  // queries that should degrade to an empty result in environments without
  // a populated index (e.g., API integration tests).
  _with_optional_reader(fn, default_value) {
    if (is_sqlite_initialized()) {
      return fn()
    }
    const { sqlite_path } = this.get_index_config()
    if (!fs_sync.existsSync(sqlite_path)) {
      return default_value
    }
    return with_sqlite_reader({ database_path: sqlite_path }, fn)
  }

  /**
   * Get entity count from the embedded database.
   * Used to detect populated database for comparison.
   * @returns {Promise<number>} Entity count or 0 on error
   */
  async _get_entity_count() {
    try {
      const result = await execute_sqlite_query({
        query: 'SELECT COUNT(*) as count FROM entities'
      })
      return result.length > 0 ? Number(result[0].count) : 0
    } catch (error) {
      log('Error getting entity count: %s', error.message)
      return 0
    }
  }

  /**
   * Perform startup sync with fallback chain:
   * 1. Check schema version - if mismatch, do reset_and_rebuild
   * 2. Try incremental sync
   * 3. On failure, try resync (update-in-place)
   * 4. On failure, try reset_and_rebuild (last resort)
   */
  async _perform_startup_sync() {
    log('Performing startup sync')

    const release_lock = await this._acquire_sync_lock()

    try {
      // Check if schema version matches current version
      let schema_matches = false
      try {
        const stored_version = await get_index_metadata({
          key: INDEX_METADATA_KEYS.SCHEMA_VERSION
        })
        schema_matches = stored_version === CURRENT_SCHEMA_VERSION
      } catch {
        schema_matches = false
      }

      if (!schema_matches) {
        const stored_version_for_migration = await get_index_metadata({
          key: INDEX_METADATA_KEYS.SCHEMA_VERSION
        }).catch(() => null)

        if (stored_version_for_migration == null) {
          log('No stored schema version, performing reset and rebuild')
          await this._reset_and_rebuild_index_internal()
          return
        }

        log(
          'Schema version mismatch (%s -> %s), attempting in-place migration',
          stored_version_for_migration,
          CURRENT_SCHEMA_VERSION
        )
        if (stored_version_for_migration === '7') {
          try {
            await migrate_to_v8({
              user_base_directory: config.user_base_directory
            })
            log('Migration succeeded, continuing startup sync')
          } catch (error) {
            log(
              'Migration failed (%s), falling back to reset and rebuild',
              error.message
            )
            await this._reset_and_rebuild_index_internal()
            return
          }
        } else {
          log(
            'No in-place migration for %s -> %s, performing reset and rebuild',
            stored_version_for_migration,
            CURRENT_SCHEMA_VERSION
          )
          await this._reset_and_rebuild_index_internal()
          return
        }
      }

      // Check if a previous rebuild was interrupted (e.g., OOM kill).
      // If so, skip incremental sync (which would miss most data since
      // repo sync state was never written) and go straight to resync.
      let rebuild_was_interrupted = false
      try {
        const rebuild_flag = await get_index_metadata({
          key: INDEX_METADATA_KEYS.REBUILD_IN_PROGRESS
        })
        rebuild_was_interrupted = rebuild_flag === 'true'
      } catch {
        // Metadata read failure is non-fatal
      }

      if (rebuild_was_interrupted) {
        log(
          'Previous rebuild was interrupted, skipping incremental sync and attempting resync'
        )
      } else {
        // Try incremental sync first
        log('Attempting incremental sync')
        const incremental_result = await sync_index_on_startup({
          index_manager: this
        })

        if (incremental_result.success) {
          log('Incremental sync successful: %o', incremental_result.stats)
          return
        }

        log('Incremental sync failed, attempting resync')
      }

      // Resync: update-in-place without dropping tables
      const resync_result = await resync_full_index({ index_manager: this })

      if (resync_result.success) {
        log('Resync successful: %o', resync_result.stats)
        return
      }

      // Resync failed, last resort: reset and rebuild
      log('Resync failed, performing reset and rebuild')
      await this._reset_and_rebuild_index_internal()
    } catch (error) {
      log(
        'Startup sync error: %s, falling back to reset and rebuild',
        error.message
      )
      try {
        await this._reset_and_rebuild_index_internal()
      } catch (rebuild_error) {
        log('Reset and rebuild also failed: %s', rebuild_error.message)
      }
    } finally {
      release_lock()
    }
  }

  /**
   * Perform update-in-place resync (index remains available)
   * Acquires sync lock to prevent concurrent operations.
   * @returns {Promise<Object>} Resync result
   */
  async perform_resync() {
    if (!this.initialized) {
      log('Index manager not initialized, cannot resync')
      return { success: false, error: 'Not initialized' }
    }

    const release_lock = await this._acquire_sync_lock()
    try {
      return await resync_full_index({ index_manager: this })
    } finally {
      release_lock()
    }
  }

  /**
   * Perform sync based on mode
   * Acquires sync lock to prevent concurrent operations.
   * @param {Object} params
   * @param {'incremental'|'resync'|'reset'} params.mode - Sync mode
   * @returns {Promise<Object>} Sync result
   */
  async perform_sync({ mode }) {
    if (!this.initialized) {
      log('Index manager not initialized, cannot sync')
      return { success: false, error: 'Not initialized' }
    }

    const release_lock = await this._acquire_sync_lock()
    try {
      switch (mode) {
        case 'incremental':
          return await sync_index_on_startup({ index_manager: this })
        case 'resync':
          return await resync_full_index({ index_manager: this })
        case 'reset':
          await this._reset_and_rebuild_index_internal()
          return { success: true, method: 'reset' }
        default:
          return { success: false, error: `Unknown sync mode: ${mode}` }
      }
    } finally {
      release_lock()
    }
  }

  /**
   * Reset and rebuild index (destructive - drops all tables)
   * Acquires sync lock to prevent concurrent operations.
   * Use for schema migrations or corruption recovery.
   * Index is NOT available during this operation.
   */
  async reset_and_rebuild_index() {
    const release_lock = await this._acquire_sync_lock()
    try {
      await this._reset_and_rebuild_index_internal()
    } finally {
      release_lock()
    }
  }

  /**
   * Internal reset and rebuild (assumes lock is already held)
   */
  async _reset_and_rebuild_index_internal() {
    log('Rebuilding full index from filesystem')

    // Clear timeline cache since all data will be repopulated
    this._timeline_sync_cache.clear()

    if (this.sqlite_ready) {
      try {
        await drop_sqlite_schema()
        await create_sqlite_schema()
        log('SQLite schema rebuilt')

        // Write schema version and rebuild_in_progress flag immediately.
        // The schema version prevents the next startup from triggering another
        // full rebuild (which OOMs again). The rebuild_in_progress flag tells
        // the next startup to use resync (update-in-place) instead of
        // incremental sync, which would miss all data since repo sync state
        // hasn't been written yet.
        await set_index_metadata({
          key: INDEX_METADATA_KEYS.SCHEMA_VERSION,
          value: CURRENT_SCHEMA_VERSION
        })
        await set_index_metadata({
          key: INDEX_METADATA_KEYS.REBUILD_IN_PROGRESS,
          value: 'true'
        })
        await checkpoint_sqlite()
        log('Schema version and rebuild_in_progress flag checkpointed')
      } catch (error) {
        log('Error rebuilding SQLite schema: %s', error.message)
      }
    }

    log('Index schemas reset, populating data from filesystem')

    // Populate threads
    await this._populate_threads_from_filesystem()

    // Populate all entity types
    await this._populate_entities_from_filesystem()

    // Backfill git activity data
    if (this.sqlite_ready) {
      try {
        log('Backfilling git activity data')
        await backfill_git_activity_from_scratch({ days: 365 })
        log('Git activity backfill complete')
      } catch (error) {
        log('Error backfilling git activity: %s', error.message)
      }
    }

    // Clear rebuild_in_progress and set sync state for all repositories
    if (this.sqlite_ready) {
      try {
        const user_base_directory = config.user_base_directory

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
          key: INDEX_METADATA_KEYS.REBUILD_IN_PROGRESS,
          value: 'false'
        })

        // Force checkpoint to persist all changes to disk.
        // This ensures sync state survives ungraceful shutdowns (e.g., PM2 SIGKILL).
        await checkpoint_sqlite()
      } catch (error) {
        log('Error updating sync metadata after rebuild: %s', error.message)
      }
    }

    log('Index rebuild complete')
  }

  async _populate_threads_from_filesystem() {
    if (!this.sqlite_ready) {
      log('SQLite not ready, skipping thread population')
      return
    }

    try {
      // Thread ID list is bounded and acceptable: UUIDs are ~36 bytes each,
      // so even 10,000 threads is ~360KB. The real memory savings come from
      // process_threads_in_batches loading metadata per-batch (100 at a time).
      const thread_ids = await list_thread_ids()
      log(
        'Populating %d threads to index using batched processing',
        thread_ids.length
      )

      const { synced, failed } = await process_threads_in_batches({
        thread_ids,
        sync_fn: ({ thread_id, metadata }) =>
          this.sync_thread({ thread_id, metadata }),
        options: {
          log_fn: log,
          progress_label: 'Thread population'
        }
      })

      log('Thread population complete: %d synced, %d failed', synced, failed)
    } catch (error) {
      log('Error populating threads: %s', error.message)
    }
  }

  async _populate_entities_from_filesystem() {
    if (!this.sqlite_ready) {
      log('SQLite not ready, skipping entity population')
      return
    }

    try {
      log('Populating entities to index using streaming batch operations')

      let synced = 0
      let failed = 0

      for await (const chunk of stream_entity_file_chunks({
        entity_directories: ENTITY_DIRECTORIES,
        chunk_size: BATCH_CHUNK_SIZE
      })) {
        // Prepare batch data for this chunk
        const entity_batch = []
        const tags_batch = []
        const relations_batch = []
        const aliases_batch = []
        const wikilinks_batch = []

        for (const entity of chunk) {
          try {
            const entity_data = entity.entity_properties
            const base_uri = entity_data?.base_uri || entity.file_info?.base_uri

            if (!base_uri) {
              failed++
              continue
            }

            const content_wikilink_targets =
              extract_content_wikilinks_from_entity_metadata({
                formatted_entity_metadata: entity.formatted_entity_metadata
              })

            const unified_entity_data = extract_unified_entity_data({
              entity_properties: entity_data,
              entity_content: entity.entity_content
            })
            const tag_base_uris = extract_tags_from_entity({
              entity_properties: entity_data
            })
            const relations = extract_relations_from_entity({
              entity_properties: entity_data
            })
            const alias_base_uris = extract_aliases_from_entity({
              entity_properties: entity_data
            })

            if (unified_entity_data) {
              entity_batch.push(unified_entity_data)
            }

            tags_batch.push({
              entity_base_uri: base_uri,
              tag_base_uris
            })

            relations_batch.push({
              source_base_uri: base_uri,
              relations
            })

            if (unified_entity_data?.entity_id) {
              aliases_batch.push({
                entity_base_uri: base_uri,
                entity_id: unified_entity_data.entity_id,
                alias_base_uris
              })
            }

            if (content_wikilink_targets.length > 0) {
              wikilinks_batch.push({
                source_base_uri: base_uri,
                target_base_uris: content_wikilink_targets
              })
            }
          } catch (error) {
            log('Error preparing entity for batch: %s', error.message)
            failed++
          }
        }

        // Execute batch operations for this chunk
        try {
          await upsert_entities_batch({ entities: entity_batch })
          await sync_entities_tags_batch({ entity_tags: tags_batch })
          await sync_entities_relations_batch({
            entity_relations: relations_batch
          })
          await sync_entities_aliases_batch({ entity_aliases: aliases_batch })
          await sync_entities_content_wikilinks_batch({
            entity_wikilinks: wikilinks_batch
          })
          synced += entity_batch.length
        } catch (error) {
          log('Error executing batch operations: %s', error.message)
          failed += entity_batch.length
        }
      }

      log('Entity population complete: %d synced, %d failed', synced, failed)
    } catch (error) {
      log('Error populating entities: %s', error.message)
    }
  }

  /**
   * Sync an entity to the embedded database
   * @returns {{ success: boolean, sqlite_synced: boolean }}
   */
  async sync_entity({
    base_uri,
    entity_data,
    entity_content = null,
    content_wikilink_targets,
    skip_ipc = false
  }) {
    const result = { success: true, sqlite_synced: false }

    if (!this.initialized) {
      log('Index manager not initialized, skipping entity sync')
      return { success: false, sqlite_synced: false }
    }

    const start = Date.now()

    const unified_entity_data = extract_unified_entity_data({
      entity_properties: entity_data,
      entity_content
    })
    const tag_base_uris = extract_tags_from_entity({
      entity_properties: entity_data
    })
    const relations = extract_relations_from_entity({
      entity_properties: entity_data
    })
    const alias_base_uris = extract_aliases_from_entity({
      entity_properties: entity_data
    })

    if (this.sqlite_ready) {
      try {
        // Sync to unified entities table (all entity types)
        if (unified_entity_data) {
          await upsert_entity_to_sqlite({ entity_data: unified_entity_data })
        }

        await sync_entity_tags_to_sqlite({
          entity_base_uri: base_uri,
          tag_base_uris
        })
        await sync_entity_relations_to_sqlite({
          source_base_uri: base_uri,
          relations
        })
        await sync_entity_aliases_to_sqlite({
          entity_base_uri: base_uri,
          entity_id: unified_entity_data?.entity_id,
          alias_base_uris
        })
        if (content_wikilink_targets) {
          await sync_entity_content_wikilinks_to_sqlite({
            source_base_uri: base_uri,
            target_base_uris: content_wikilink_targets
          })
        }
        result.sqlite_synced = true
        if (this._metrics) {
          this._metrics.increment('entity_syncs')
          this._metrics.timing('entity_sync', Date.now() - start)
          this._metrics.record_sync()
        }
        // Notify base-api of entity change via IPC (skipped during bulk resync)
        if (!skip_ipc) {
          try {
            await write_entity_change_notification({
              event_type: 'update',
              base_uri
            })
          } catch (ipc_error) {
            log('Entity change IPC write failed: %s', ipc_error.message)
          }
        }
      } catch (error) {
        log('Error syncing entity to SQLite: %s', error.message)
        result.success = false
        if (this._metrics) this._metrics.increment('sync_errors')
      }
    }

    return result
  }

  async remove_entity({ base_uri }) {
    if (!this.initialized) {
      log('Index manager not initialized, skipping entity removal')
      return
    }

    if (this.sqlite_ready) {
      try {
        await delete_entity_from_sqlite({ base_uri })
        if (this._metrics) this._metrics.increment('entity_deletes')
        // Notify base-api of entity deletion via IPC
        try {
          await write_entity_change_notification({
            event_type: 'delete',
            base_uri
          })
        } catch (ipc_error) {
          log('Entity change IPC write failed: %s', ipc_error.message)
        }
      } catch (error) {
        log('Error removing entity from SQLite: %s', error.message)
        if (this._metrics) this._metrics.increment('sync_errors')
      }
    }
  }

  /**
   * Sync a thread to the embedded database.
   * Deduplicates concurrent requests for the same thread_id - if a sync is
   * already in progress for a thread, subsequent requests will wait for the
   * existing sync to complete and receive the same result.
   * @returns {{ success: boolean, sqlite_synced: boolean }}
   */
  async sync_thread({ thread_id, metadata }) {
    // Check if there's already a pending sync for this thread
    const pending = this._pending_thread_syncs.get(thread_id)

    if (pending) {
      // Update metadata to latest version (caller may have newer data)
      pending.metadata = metadata
      log('Thread sync deduplicated for %s', thread_id)

      // Return a promise that resolves/rejects when the existing sync completes
      return new Promise((resolve, reject) => {
        pending.callbacks.push({ resolve, reject })
      })
    }

    // No pending sync - create entry and execute
    const pending_entry = {
      metadata,
      callbacks: [] // Array of { resolve, reject } pairs
    }
    this._pending_thread_syncs.set(thread_id, pending_entry)

    try {
      // Execute the actual sync with the latest metadata
      const result = await this._execute_thread_sync({
        thread_id,
        metadata: pending_entry.metadata
      })

      // Resolve all waiting callbacks with the same result
      for (const { resolve } of pending_entry.callbacks) {
        try {
          resolve(result)
        } catch (callback_error) {
          log('Error resolving sync callback: %s', callback_error.message)
        }
      }

      return result
    } catch (error) {
      // Reject all waiting callbacks with the same error
      for (const { reject } of pending_entry.callbacks) {
        try {
          reject(error)
        } catch (callback_error) {
          log('Error rejecting sync callback: %s', callback_error.message)
        }
      }
      throw error
    } finally {
      // Always remove from pending map when done
      this._pending_thread_syncs.delete(thread_id)
    }
  }

  /**
   * Internal method that performs the actual thread sync.
   * Called by sync_thread after deduplication.
   * @private
   */
  async _execute_thread_sync({ thread_id, metadata }) {
    const result = { success: true, sqlite_synced: false }

    if (!this.initialized) {
      log('Index manager not initialized, skipping thread sync')
      return { success: false, sqlite_synced: false }
    }

    const start = Date.now()

    // Sync to SQLite
    if (this.sqlite_ready) {
      try {
        const thread_index_data = extract_thread_index_data({
          thread_id,
          metadata
        })

        // Check timeline file size to skip redundant extraction
        const thread_base_dir = get_thread_base_directory({})
        const timeline_path = path.join(
          thread_base_dir,
          thread_id,
          'timeline.jsonl'
        )
        let timeline_size = 0
        let timeline_mtime = 0
        try {
          const stat = await fs.stat(timeline_path)
          timeline_size = stat.size
          timeline_mtime = stat.mtimeMs
        } catch {
          // File doesn't exist yet
        }

        const cached_timeline = this._timeline_sync_cache.get(thread_id)
        let latest_event_data
        if (
          cached_timeline &&
          cached_timeline.size === timeline_size &&
          cached_timeline.mtime === timeline_mtime
        ) {
          latest_event_data = cached_timeline.event_data
          if (this._metrics) this._metrics.increment('cache_hits')
          log(
            'Skipping timeline re-extraction for %s (size unchanged at %d)',
            thread_id,
            timeline_size
          )
        } else {
          if (this._metrics) this._metrics.increment('cache_misses')
          latest_event_data = await read_and_extract_latest_event({
            thread_id
          })

          // Timeline changed (or first sync): refresh thread_timeline rows.
          // The _timeline_sync_cache is the single source of truth for
          // changedness; sync_thread_timeline does not maintain its own cache.
          try {
            await sync_thread_timeline({ thread_id })
          } catch (timeline_error) {
            log(
              'Error syncing thread_timeline for %s: %s',
              thread_id,
              timeline_error.message
            )
          }

          this._timeline_sync_cache.set(thread_id, {
            size: timeline_size,
            mtime: timeline_mtime,
            event_data: latest_event_data
          })
          // Evict oldest entry when cache exceeds cap (Map preserves insertion order).
          // Size exceeds cap by at most 1 per insertion, so a single eviction suffices.
          if (this._timeline_sync_cache.size > this._timeline_cache_max_size) {
            const oldest_key = this._timeline_sync_cache.keys().next().value
            this._timeline_sync_cache.delete(oldest_key)
          }
          if (this._metrics) {
            this._metrics.gauge('cache_size', this._timeline_sync_cache.size)
          }
        }

        await upsert_thread_to_sqlite({
          thread_data: {
            ...thread_index_data,
            ...latest_event_data
          }
        })
        result.sqlite_synced = true
        if (this._metrics) {
          this._metrics.increment('thread_syncs')
          this._metrics.timing('thread_sync', Date.now() - start)
          this._metrics.record_sync()
        }
      } catch (error) {
        log('Error syncing thread to SQLite: %s', error.message)
        result.success = false
        if (this._metrics) this._metrics.increment('sync_errors')
      }

      // Sync thread relations if present (outside main try-catch to not affect thread sync result)
      // Merge auto-analyzed relations and user-added relations for SQLite
      const auto_relations = Array.isArray(metadata?.relations)
        ? metadata.relations
        : []
      const user_relations = Array.isArray(metadata?.user_relations)
        ? metadata.user_relations
        : []
      const combined_relations = [...auto_relations, ...user_relations]
      if (result.sqlite_synced && combined_relations.length > 0) {
        try {
          const relations = extract_relations_from_entity({
            entity_properties: { relations: combined_relations }
          })
          const thread_base_uri = `user:thread/${thread_id}`
          await sync_entity_relations_to_sqlite({
            source_base_uri: thread_base_uri,
            relations
          })
          log(
            'Thread relations synced: %s (%d relations)',
            thread_id,
            relations.length
          )
        } catch (error) {
          log('Error syncing thread relations: %s', error.message)
        }
      }

      // Sync thread-metadata references (relations + file_references) so
      // back-reference queries surface thread sources alongside entities.
      if (result.sqlite_synced) {
        try {
          const {
            relations: relation_targets,
            file_references: file_reference_targets
          } = extract_thread_reference_targets({ metadata })
          await sync_thread_references_to_sqlite({
            thread_id,
            relation_targets,
            file_reference_targets
          })
        } catch (error) {
          log('Error syncing thread references: %s', error.message)
        }
      }

      // Sync thread tags (outside main try-catch to not affect thread sync result)
      // Always sync when metadata.tags is an array so that clearing tags removes stale rows.
      if (result.sqlite_synced && Array.isArray(metadata?.tags)) {
        try {
          await sync_thread_tags_to_sqlite({
            thread_id,
            tag_base_uris: metadata.tags
          })
          log(
            'Thread tags synced: %s (%d tags)',
            thread_id,
            metadata.tags.length
          )
        } catch (error) {
          log('Error syncing thread tags: %s', error.message)
        }
      }
    }

    return result
  }

  async remove_thread({ thread_id }) {
    if (!this.initialized) {
      log('Index manager not initialized, skipping thread removal')
      return
    }

    // Remove from SQLite
    if (this.sqlite_ready) {
      try {
        await delete_thread_from_sqlite({ thread_id })
        await delete_thread_timeline({ thread_id })
        this._timeline_sync_cache.delete(thread_id)
        if (this._metrics) this._metrics.increment('thread_deletes')
      } catch (error) {
        log('Error removing thread from SQLite: %s', error.message)
        if (this._metrics) this._metrics.increment('sync_errors')
      }

      // Clean up thread relations
      try {
        const thread_base_uri = `user:thread/${thread_id}`
        await execute_sqlite_run({
          query: 'DELETE FROM entity_relations WHERE source_base_uri = ?',
          parameters: [thread_base_uri]
        })
        log('Thread relations deleted: %s', thread_id)
      } catch (error) {
        log('Error deleting thread relations: %s', error.message)
      }

      // Clean up thread references
      try {
        await execute_sqlite_run({
          query: 'DELETE FROM thread_references WHERE thread_id = ?',
          parameters: [thread_id]
        })
      } catch (error) {
        log('Error deleting thread references: %s', error.message)
      }
    }
  }

  // ---- Read methods (short-lived readonly handle per call) ----

  async query_threads(params) {
    return this._with_reader(() => this._backend.query_threads(params))
  }

  async count_threads(params) {
    return this._with_reader(() => this._backend.count_threads(params))
  }

  async query_tasks(params) {
    return this._with_reader(() => this._backend.query_tasks(params))
  }

  async count_tasks(params) {
    return this._with_reader(() => this._backend.count_tasks(params))
  }

  async query_physical_items(params) {
    return this._with_reader(() => this._backend.query_physical_items(params))
  }

  async count_physical_items(params) {
    return this._with_reader(() => this._backend.count_physical_items(params))
  }

  async query_entities(params) {
    return this._with_reader(() => this._backend.query_entities(params))
  }

  async count_entities(params) {
    return this._with_reader(() => this._backend.count_entities(params))
  }

  async get_entity_by_uri(params) {
    return this._with_reader(() => this._backend.get_entity_by_uri(params))
  }

  async get_entity_by_id(params) {
    return this._with_reader(() => this._backend.get_entity_by_id(params))
  }

  async find_related_entities(params) {
    return this._with_reader(() => this._backend.find_related_entities(params))
  }

  async find_entities_relating_to(params) {
    return this._with_reader(() =>
      this._backend.find_entities_relating_to(params)
    )
  }

  async find_threads_relating_to(params) {
    return this._with_reader(() =>
      this._backend.find_threads_relating_to(params)
    )
  }

  async query_tags(params) {
    return this._with_reader(() => this._backend.query_tags(params))
  }

  async query_tag_statistics(params) {
    return this._with_reader(() => this._backend.query_tag_statistics(params))
  }

  async query_git_activity_daily(params) {
    return this._with_optional_reader(
      () => this._backend.query_git_activity_daily(params),
      []
    )
  }

  async query_thread_activity_aggregated(params) {
    return this._with_optional_reader(
      () => this._backend.query_thread_activity_aggregated(params),
      []
    )
  }

  async query_task_activity_aggregated(params) {
    return this._with_optional_reader(
      () => this._backend.query_task_activity_aggregated(params),
      []
    )
  }

  async query_heatmap_daily(params) {
    return this._with_reader(() => this._backend.query_heatmap_daily(params))
  }

  async get_heatmap_count() {
    return this._with_reader(() => this._backend.get_heatmap_count())
  }

  async query_entities_by_thread_activity(params) {
    return this._with_reader(() =>
      this._backend.query_entities_by_thread_activity(params)
    )
  }

  async query_tasks_for_activity(params) {
    return this._with_reader(() =>
      this._backend.query_tasks_for_activity(params)
    )
  }

  async search_similar(params) {
    return this._with_reader(() => this._backend.search_similar(params))
  }

  async get_embedding_hashes() {
    return this._with_reader(() => this._backend.get_embedding_hashes())
  }

  // ---- Write methods (writer-path module-level handle) ----

  async upsert_git_activity_daily_batch(params) {
    return this._backend.upsert_git_activity_daily_batch(params)
  }

  async upsert_heatmap_daily_batch(params) {
    return this._backend.upsert_heatmap_daily_batch(params)
  }

  async truncate_heatmap_daily() {
    return this._backend.truncate_heatmap_daily()
  }

  async upsert_embeddings(params) {
    return this._backend.upsert_embeddings(params)
  }

  async delete_entity_embeddings(params) {
    return this._backend.delete_entity_embeddings(params)
  }

  get_index_status() {
    return {
      initialized: this.initialized,
      sqlite_ready: this.sqlite_ready,
      config: this.index_config
    }
  }

  async checkpoint() {
    if (!this.sqlite_ready) return
    await checkpoint_sqlite()
  }

  is_ready() {
    if (this.initialized && this.sqlite_ready) return true
    // Tests share a module-level handle via initialize_sqlite_client without
    // going through the manager's initialize(); honor that state.
    if (is_sqlite_initialized()) return true
    // Reader-only processes (e.g., base-api) never initialize the manager.
    // Treat the index as ready if the SQLite file exists at the configured
    // path -- reads open short-lived readonly handles per operation.
    try {
      const { sqlite_path } = this.get_index_config()
      return Boolean(sqlite_path) && fs_sync.existsSync(sqlite_path)
    } catch {
      return false
    }
  }

  is_sqlite_ready() {
    return this.initialized && this.sqlite_ready
  }

  async shutdown() {
    if (!this.initialized) return

    log('Shutting down embedded index manager')

    if (this.sqlite_ready) {
      try {
        await close_sqlite_connection()
        log('SQLite connection closed')
      } catch (error) {
        log('Error closing SQLite connection: %s', error.message)
      }
    }

    this.initialized = false
    this.sqlite_ready = false
    this._timeline_sync_cache.clear()
    log('Embedded index manager shut down')
  }
}

const embedded_index_manager = new EmbeddedIndexManager()

// Eagerly resolve the index config so the SQLite client knows the on-disk
// path for transient read-only fallback even before any query runs.
try {
  embedded_index_manager.get_index_config()
} catch (error) {
  log('Eager index config resolution failed: %s', error.message)
}

export default embedded_index_manager
export { EmbeddedIndexManager }
