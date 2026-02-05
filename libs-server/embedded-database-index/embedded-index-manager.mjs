/**
 * Embedded Index Manager
 *
 * Singleton that coordinates Kuzu and DuckDB databases for index operations.
 * Handles initialization, sync, rebuild, and shutdown.
 */

import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'

import config from '#config'
import {
  get_kuzu_connection,
  close_kuzu_connection,
  initialize_kuzu_client,
  execute_kuzu_query,
  destroy_kuzu_database
} from './kuzu/kuzu-database-client.mjs'
import {
  create_kuzu_schema,
  drop_kuzu_schema
} from './kuzu/kuzu-schema-definitions.mjs'
import {
  upsert_entity_to_kuzu,
  delete_entity_from_kuzu,
  sync_entity_tags_to_kuzu,
  sync_entity_relations_to_kuzu
} from './kuzu/kuzu-entity-sync.mjs'
import {
  upsert_thread_to_kuzu,
  delete_thread_from_kuzu,
  sync_thread_relations_to_kuzu,
  sync_thread_file_references_to_kuzu
} from './kuzu/kuzu-thread-sync.mjs'
import {
  close_duckdb_connection,
  initialize_duckdb_client,
  execute_duckdb_query,
  checkpoint_duckdb
} from './duckdb/duckdb-database-client.mjs'
import {
  create_duckdb_schema,
  drop_duckdb_schema
} from './duckdb/duckdb-schema-definitions.mjs'
import {
  upsert_thread_to_duckdb,
  upsert_entity_to_duckdb,
  delete_thread_from_duckdb,
  delete_entity_from_duckdb,
  sync_entity_tags_to_duckdb,
  sync_entity_relations_to_duckdb
} from './duckdb/duckdb-entity-sync.mjs'
import {
  extract_entity_index_data,
  extract_unified_entity_data,
  extract_tags_from_entity,
  extract_relations_from_entity
} from './sync/entity-data-extractor.mjs'
import {
  extract_thread_index_data,
  extract_thread_entity_data,
  extract_thread_relations_for_kuzu,
  read_and_extract_latest_event
} from './sync/thread-data-extractor.mjs'
import { sync_index_on_startup } from './sync/incremental-sync.mjs'
import { backfill_git_activity_from_scratch } from './sync/sync-git-activity.mjs'
import { resync_full_index } from './sync/resync-full-index.mjs'
import {
  get_index_metadata,
  set_index_metadata,
  set_repo_sync_state,
  INDEX_METADATA_KEYS,
  CURRENT_SCHEMA_VERSION
} from './duckdb/duckdb-metadata-operations.mjs'
import { ENTITY_DIRECTORIES } from './sync/sync-constants.mjs'
import {
  discover_repositories,
  get_repository_head_sha
} from './sync/repository-discovery.mjs'
import {
  list_thread_ids,
  process_threads_in_batches
} from '#libs-server/threads/list-threads.mjs'
import { get_thread_base_directory } from '#libs-server/threads/threads-constants.mjs'
import { list_entity_files_from_filesystem } from '#libs-server/repository/filesystem/list-entity-files-from-filesystem.mjs'

const log = debug('embedded-index')

class EmbeddedIndexManager {
  constructor() {
    this.initialized = false
    this.kuzu_ready = false
    this.duckdb_ready = false
    this.index_config = null
    this.sync_in_progress = false
    this._sync_lock_queue = []
    // Map of thread_id -> { metadata, callbacks: [{ resolve, reject }] }
    // Used to coalesce repeated sync requests for the same thread
    this._pending_thread_syncs = new Map()
    // Map of thread_id -> { size: number, mtime: number, event_data: Object }
    // Caches timeline extraction results keyed by file size + mtime to skip
    // re-extraction when only metadata changes.
    // Cleared on rebuild and shutdown; bounded by total thread count.
    this._timeline_sync_cache = new Map()
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

  _get_index_config() {
    if (this.index_config) {
      return this.index_config
    }

    const user_base_directory = config.user_base_directory
    const embedded_config = config.embedded_database_index || {}

    this.index_config = {
      enabled: embedded_config.enabled !== false,
      kuzu_directory:
        embedded_config.kuzu_directory ||
        `${user_base_directory}/embedded-database-index/kuzu`,
      duckdb_path:
        embedded_config.duckdb_path ||
        `${user_base_directory}/embedded-database-index/duckdb.db`,
      file_watcher_enabled: embedded_config.file_watcher_enabled !== false
    }

    return this.index_config
  }

  async initialize() {
    if (this.initialized) {
      log('Index manager already initialized')
      return
    }

    const index_config = this._get_index_config()

    if (!index_config.enabled) {
      log('Embedded database index is disabled')
      return
    }

    log('Initializing embedded index manager')

    try {
      await this._initialize_kuzu(index_config)
      this.kuzu_ready = true
      log('Kuzu database initialized')
    } catch (error) {
      log('Failed to initialize Kuzu: %s', error.message)
      this.kuzu_ready = false
    }

    try {
      await this._initialize_duckdb(index_config)
      this.duckdb_ready = true
      log('DuckDB database initialized')
    } catch (error) {
      log('Failed to initialize DuckDB: %s', error.message)
      this.duckdb_ready = false
    }

    this.initialized = true

    // Perform startup sync with fallback chain
    if (this.duckdb_ready) {
      await this._perform_startup_sync()
    }

    log(
      'Embedded index manager initialized (kuzu: %s, duckdb: %s)',
      this.kuzu_ready,
      this.duckdb_ready
    )
  }

  async _initialize_kuzu(index_config) {
    await initialize_kuzu_client({ database_path: index_config.kuzu_directory })
    try {
      const kuzu_connection = await get_kuzu_connection()
      await create_kuzu_schema({ connection: kuzu_connection })
    } catch (error) {
      const is_wal_corruption =
        error.message && error.message.includes('Failed to replay wal record')

      if (is_wal_corruption) {
        log(
          'Kuzu WAL corruption detected, destroying database and retrying: %s',
          error.message
        )
        await destroy_kuzu_database()

        // Retry with a fresh database
        await initialize_kuzu_client({
          database_path: index_config.kuzu_directory
        })
        const kuzu_connection = await get_kuzu_connection()
        await create_kuzu_schema({ connection: kuzu_connection })
        log('Kuzu database recovered from WAL corruption')
        return
      }

      throw error
    }
  }

  async _initialize_duckdb(index_config) {
    await initialize_duckdb_client({ database_path: index_config.duckdb_path })
    await create_duckdb_schema()
  }

  /**
   * Get entity count from Kuzu database.
   * Used to detect empty database that needs resync.
   * @returns {Promise<number>} Entity count or 0 on error
   */
  async _get_kuzu_entity_count() {
    try {
      const result = await execute_kuzu_query({
        query: 'MATCH (e:Entity) RETURN count(e) AS count'
      })
      // Kuzu returns QueryResult, need to get all rows
      const rows = await result.getAll()
      return rows.length > 0 ? Number(rows[0].count) : 0
    } catch (error) {
      log('Error getting Kuzu entity count: %s', error.message)
      return 0
    }
  }

  /**
   * Get entity count from DuckDB database.
   * Used to detect populated database for comparison with Kuzu.
   * @returns {Promise<number>} Entity count or 0 on error
   */
  async _get_duckdb_entity_count() {
    try {
      const result = await execute_duckdb_query({
        query: 'SELECT COUNT(*) as count FROM entities'
      })
      return result.length > 0 ? Number(result[0].count) : 0
    } catch (error) {
      log('Error getting DuckDB entity count: %s', error.message)
      return 0
    }
  }

  /**
   * Perform startup sync with fallback chain:
   * 1. Check schema version - if mismatch, do reset_and_rebuild
   * 2. Check database sync - if Kuzu empty but DuckDB populated, do resync
   * 3. Try incremental sync
   * 4. On failure, try resync (update-in-place)
   * 5. On failure, try reset_and_rebuild (last resort)
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
        log('Schema version mismatch, performing reset and rebuild')
        await this._reset_and_rebuild_index_internal()
        return
      }

      // Check if databases are out of sync (Kuzu empty but DuckDB populated)
      // This handles cases where Kuzu was deleted/corrupted and recreated
      if (this.kuzu_ready && this.duckdb_ready) {
        const kuzu_count = await this._get_kuzu_entity_count()
        const duckdb_count = await this._get_duckdb_entity_count()

        if (duckdb_count > 0 && kuzu_count === 0) {
          log(
            'Kuzu is empty but DuckDB has %d entities, triggering resync',
            duckdb_count
          )
          const resync_result = await resync_full_index({ index_manager: this })
          if (resync_result.success) {
            log('Database sync resync successful: %o', resync_result.stats)
            return
          }
          // Fall through to reset if resync fails
          log('Database sync resync failed, performing reset and rebuild')
          await this._reset_and_rebuild_index_internal()
          return
        }
      }

      // Try incremental sync first
      log('Attempting incremental sync')
      const incremental_result = await sync_index_on_startup({
        index_manager: this
      })

      if (incremental_result.success) {
        log('Incremental sync successful: %o', incremental_result.stats)
        return
      }

      // Incremental failed, try resync
      log('Incremental sync failed, attempting resync')
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

    if (this.kuzu_ready) {
      try {
        const kuzu_connection = await get_kuzu_connection()
        await drop_kuzu_schema({ connection: kuzu_connection })
        await create_kuzu_schema({ connection: kuzu_connection })
        log('Kuzu schema rebuilt')
      } catch (error) {
        log('Error rebuilding Kuzu schema: %s', error.message)
      }
    }

    if (this.duckdb_ready) {
      try {
        await drop_duckdb_schema()
        await create_duckdb_schema()
        log('DuckDB schema rebuilt')
      } catch (error) {
        log('Error rebuilding DuckDB schema: %s', error.message)
      }
    }

    log('Index schemas reset, populating data from filesystem')

    // Populate threads
    await this._populate_threads_from_filesystem()

    // Populate all entity types
    await this._populate_entities_from_filesystem()

    // Backfill git activity data
    if (this.duckdb_ready) {
      try {
        log('Backfilling git activity data')
        await backfill_git_activity_from_scratch({ days: 365 })
        log('Git activity backfill complete')
      } catch (error) {
        log('Error backfilling git activity: %s', error.message)
      }
    }

    // Set schema version and sync state for all repositories
    if (this.duckdb_ready) {
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
          key: INDEX_METADATA_KEYS.SCHEMA_VERSION,
          value: CURRENT_SCHEMA_VERSION
        })

        // Force checkpoint to persist all changes to disk.
        // This ensures schema version survives ungraceful shutdowns (e.g., PM2 SIGKILL).
        await checkpoint_duckdb()
      } catch (error) {
        log('Error updating sync metadata after rebuild: %s', error.message)
      }
    }

    log('Index rebuild complete')
  }

  async _populate_threads_from_filesystem() {
    if (!this.duckdb_ready && !this.kuzu_ready) {
      log('Neither DuckDB nor Kuzu ready, skipping thread population')
      return
    }

    try {
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
    if (!this.duckdb_ready && !this.kuzu_ready) {
      log('Neither DuckDB nor Kuzu ready, skipping entity population')
      return
    }

    try {
      const entities = await list_entity_files_from_filesystem({
        include_entity_types: ENTITY_DIRECTORIES
      })

      log('Populating %d entities to index', entities.length)

      let synced = 0
      let failed = 0

      for (const entity of entities) {
        const base_uri =
          entity.entity_properties?.base_uri || entity.file_info?.base_uri
        const result = await this.sync_entity({
          base_uri,
          entity_data: entity.entity_properties
        })
        if (result.success) {
          synced++
        } else {
          failed++
        }
      }

      log('Entity population complete: %d synced, %d failed', synced, failed)
    } catch (error) {
      log('Error populating entities: %s', error.message)
    }
  }

  /**
   * Sync an entity to the embedded databases
   * @returns {{ success: boolean, kuzu_synced: boolean, duckdb_synced: boolean }}
   */
  async sync_entity({ base_uri, entity_data }) {
    const result = { success: true, kuzu_synced: false, duckdb_synced: false }

    if (!this.initialized) {
      log('Index manager not initialized, skipping entity sync')
      return { success: false, kuzu_synced: false, duckdb_synced: false }
    }

    const entity_index_data = extract_entity_index_data({
      entity_properties: entity_data
    })
    const unified_entity_data = extract_unified_entity_data({
      entity_properties: entity_data
    })
    const tag_base_uris = extract_tags_from_entity({
      entity_properties: entity_data
    })
    const relations = extract_relations_from_entity({
      entity_properties: entity_data
    })

    if (this.kuzu_ready) {
      try {
        const kuzu_connection = await get_kuzu_connection()
        await upsert_entity_to_kuzu({
          connection: kuzu_connection,
          entity_data: entity_index_data
        })
        await sync_entity_tags_to_kuzu({
          connection: kuzu_connection,
          entity_base_uri: base_uri,
          tag_base_uris
        })
        await sync_entity_relations_to_kuzu({
          connection: kuzu_connection,
          entity_base_uri: base_uri,
          relations
        })
        result.kuzu_synced = true
      } catch (error) {
        log('Error syncing entity to Kuzu: %s', error.message)
        result.success = false
      }
    }

    if (this.duckdb_ready) {
      try {
        // Sync to unified entities table (all entity types)
        if (unified_entity_data) {
          await upsert_entity_to_duckdb({ entity_data: unified_entity_data })
        }

        await sync_entity_tags_to_duckdb({
          entity_base_uri: base_uri,
          tag_base_uris
        })
        await sync_entity_relations_to_duckdb({
          source_base_uri: base_uri,
          relations
        })
        result.duckdb_synced = true
      } catch (error) {
        log('Error syncing entity to DuckDB: %s', error.message)
        result.success = false
      }
    }

    return result
  }

  async remove_entity({ base_uri }) {
    if (!this.initialized) {
      log('Index manager not initialized, skipping entity removal')
      return
    }

    if (this.kuzu_ready) {
      try {
        const kuzu_connection = await get_kuzu_connection()
        await delete_entity_from_kuzu({ connection: kuzu_connection, base_uri })
      } catch (error) {
        log('Error removing entity from Kuzu: %s', error.message)
      }
    }

    if (this.duckdb_ready) {
      try {
        await delete_entity_from_duckdb({ base_uri })
      } catch (error) {
        log('Error removing entity from DuckDB: %s', error.message)
      }
    }
  }

  /**
   * Sync a thread to the embedded databases.
   * Deduplicates concurrent requests for the same thread_id - if a sync is
   * already in progress for a thread, subsequent requests will wait for the
   * existing sync to complete and receive the same result.
   * @returns {{ success: boolean, kuzu_synced: boolean, duckdb_synced: boolean }}
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
    const result = { success: true, kuzu_synced: false, duckdb_synced: false }

    if (!this.initialized) {
      log('Index manager not initialized, skipping thread sync')
      return { success: false, kuzu_synced: false, duckdb_synced: false }
    }

    // Sync to DuckDB
    if (this.duckdb_ready) {
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
          log(
            'Skipping timeline re-extraction for %s (size unchanged at %d)',
            thread_id,
            timeline_size
          )
        } else {
          latest_event_data = await read_and_extract_latest_event({
            thread_id
          })
          this._timeline_sync_cache.set(thread_id, {
            size: timeline_size,
            mtime: timeline_mtime,
            event_data: latest_event_data
          })
        }

        await upsert_thread_to_duckdb({
          thread_data: {
            ...thread_index_data,
            ...latest_event_data
          }
        })
        result.duckdb_synced = true
      } catch (error) {
        log('Error syncing thread to DuckDB: %s', error.message)
        result.success = false
      }
    }

    // Sync to Kuzu
    if (this.kuzu_ready) {
      try {
        const kuzu_connection = await get_kuzu_connection()

        // Upsert thread as entity
        const thread_entity_data = extract_thread_entity_data({
          thread_id,
          metadata
        })
        await upsert_thread_to_kuzu({
          connection: kuzu_connection,
          thread_data: thread_entity_data
        })

        // Sync thread relations
        const thread_relations = extract_thread_relations_for_kuzu({ metadata })
        await sync_thread_relations_to_kuzu({
          connection: kuzu_connection,
          thread_id,
          relations: thread_relations
        })

        // Sync file references if present
        const file_references = metadata.file_references || []
        const directory_references = metadata.directory_references || []
        if (file_references.length > 0 || directory_references.length > 0) {
          await sync_thread_file_references_to_kuzu({
            connection: kuzu_connection,
            thread_id,
            file_references,
            directory_references
          })
        }
        result.kuzu_synced = true
      } catch (error) {
        log('Error syncing thread to Kuzu: %s', error.message)
        result.success = false
      }
    }

    return result
  }

  async remove_thread({ thread_id }) {
    if (!this.initialized) {
      log('Index manager not initialized, skipping thread removal')
      return
    }

    // Remove from DuckDB
    if (this.duckdb_ready) {
      try {
        await delete_thread_from_duckdb({ thread_id })
      } catch (error) {
        log('Error removing thread from DuckDB: %s', error.message)
      }
    }

    // Remove from Kuzu
    if (this.kuzu_ready) {
      try {
        const kuzu_connection = await get_kuzu_connection()
        await delete_thread_from_kuzu({
          connection: kuzu_connection,
          thread_id
        })
      } catch (error) {
        log('Error removing thread from Kuzu: %s', error.message)
      }
    }
  }

  get_index_status() {
    return {
      initialized: this.initialized,
      kuzu_ready: this.kuzu_ready,
      duckdb_ready: this.duckdb_ready,
      config: this.index_config
    }
  }

  is_ready() {
    return this.initialized && (this.kuzu_ready || this.duckdb_ready)
  }

  is_kuzu_ready() {
    return this.initialized && this.kuzu_ready
  }

  /**
   * Check if Kuzu is ready AND not blocked by an ongoing sync operation.
   * Kuzu uses a single connection, so queries will hang indefinitely
   * if issued while a sync operation holds the connection.
   */
  is_kuzu_query_safe() {
    return this.initialized && this.kuzu_ready && !this.sync_in_progress
  }

  is_duckdb_ready() {
    return this.initialized && this.duckdb_ready
  }

  async shutdown() {
    log('Shutting down embedded index manager')

    if (this.kuzu_ready) {
      try {
        await close_kuzu_connection()
        log('Kuzu connection closed')
      } catch (error) {
        log('Error closing Kuzu connection: %s', error.message)
      }
    }

    if (this.duckdb_ready) {
      try {
        await close_duckdb_connection()
        log('DuckDB connection closed')
      } catch (error) {
        log('Error closing DuckDB connection: %s', error.message)
      }
    }

    this.initialized = false
    this.kuzu_ready = false
    this.duckdb_ready = false
    this._timeline_sync_cache.clear()
    log('Embedded index manager shut down')
  }
}

const embedded_index_manager = new EmbeddedIndexManager()

export default embedded_index_manager
export { EmbeddedIndexManager }
