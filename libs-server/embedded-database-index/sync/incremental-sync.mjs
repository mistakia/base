/**
 * Incremental Sync
 *
 * Git-based change detection for syncing only modified files.
 * Supports multi-repository sync (main repo + git submodules).
 *
 * TOCTOU handling: All sync functions check file existence at sync time,
 * treating ENOENT as delete operations to avoid race conditions.
 */

import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'

import config from '#config'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import {
  set_index_metadata,
  INDEX_METADATA_KEYS,
  CURRENT_SCHEMA_VERSION,
  get_repo_sync_state,
  set_repo_sync_state
} from '../duckdb/duckdb-metadata-operations.mjs'
import {
  ENTITY_DIRECTORIES,
  filter_entity_files,
  filter_thread_metadata_files,
  extract_thread_id_from_path
} from './sync-constants.mjs'
import { get_all_changed_files } from './repository-discovery.mjs'

const log = debug('embedded-index:sync:incremental')

/**
 * Sync a single entity file (add/modify/delete).
 * @returns {Promise<{action: 'synced'|'deleted'|'failed', error?: string}>}
 */
async function sync_entity_file({ file_path, repo_path, index_manager }) {
  const absolute_path = path.join(repo_path, file_path)
  const base_uri = `user:${file_path}`

  try {
    const result = await read_entity_from_filesystem({ absolute_path })

    if (!result.success) {
      // File doesn't exist or can't be read - treat as delete
      if (result.error?.includes('ENOENT') || result.error?.includes('no such file')) {
        await index_manager.remove_entity({ base_uri })
        log('Deleted (file not found): %s', base_uri)
        return { action: 'deleted' }
      }
      log('Failed to read entity %s: %s', file_path, result.error)
      return { action: 'failed', error: result.error }
    }

    await index_manager.sync_entity({
      base_uri,
      entity_data: result.entity_properties
    })
    log('Synced: %s', base_uri)
    return { action: 'synced' }
  } catch (error) {
    // Handle ENOENT at sync time - file was deleted between detection and sync
    if (error.code === 'ENOENT') {
      try {
        await index_manager.remove_entity({ base_uri })
        log('Deleted (ENOENT): %s', base_uri)
        return { action: 'deleted' }
      } catch (delete_error) {
        log('Error deleting %s: %s', file_path, delete_error.message)
        return { action: 'failed', error: delete_error.message }
      }
    }
    log('Error syncing %s: %s', file_path, error.message)
    return { action: 'failed', error: error.message }
  }
}

/**
 * Perform incremental sync for changed entity files.
 * @returns {Promise<{synced: number, deleted: number, failed: number}>}
 */
export async function perform_incremental_sync({
  repo_path,
  file_paths,
  index_manager
}) {
  const stats = { synced: 0, deleted: 0, failed: 0 }

  for (const file_path of file_paths) {
    const result = await sync_entity_file({ file_path, repo_path, index_manager })
    stats[result.action]++
  }

  return stats
}

/**
 * Sync a single thread metadata file (add/modify/delete).
 * @returns {Promise<{action: 'synced'|'deleted'|'failed', error?: string}>}
 */
async function sync_thread_file({ file_path, repo_path, index_manager }) {
  const thread_id = extract_thread_id_from_path(file_path)
  if (!thread_id) {
    log('Could not extract thread_id from path: %s', file_path)
    return { action: 'failed', error: 'Invalid thread path' }
  }

  const absolute_path = path.join(repo_path, file_path)

  try {
    const content = await fs.readFile(absolute_path, 'utf-8')
    const metadata = JSON.parse(content)

    await index_manager.sync_thread({ thread_id, metadata })
    log('Synced thread: %s', thread_id)
    return { action: 'synced' }
  } catch (error) {
    // Handle ENOENT at sync time - file was deleted between detection and sync
    if (error.code === 'ENOENT') {
      try {
        await index_manager.remove_thread({ thread_id })
        log('Deleted thread (ENOENT): %s', thread_id)
        return { action: 'deleted' }
      } catch (delete_error) {
        log('Error deleting thread %s: %s', thread_id, delete_error.message)
        return { action: 'failed', error: delete_error.message }
      }
    }
    log('Error syncing thread %s: %s', file_path, error.message)
    return { action: 'failed', error: error.message }
  }
}

/**
 * Sync changed thread metadata files.
 * @returns {Promise<{synced: number, deleted: number, failed: number}>}
 */
async function sync_changed_threads({ repo_path, file_paths, index_manager }) {
  const stats = { synced: 0, deleted: 0, failed: 0 }

  for (const file_path of file_paths) {
    const result = await sync_thread_file({ file_path, repo_path, index_manager })
    stats[result.action]++
  }

  return stats
}

/**
 * Main entry point for startup sync (multi-repository aware).
 * Detects changes across main repo and git submodules, syncs entities and threads.
 * @returns {Promise<{success: boolean, method: string, stats: Object}>}
 */
export async function sync_index_on_startup({ repo_path, index_manager }) {
  const user_base_directory = repo_path || config.user_base_directory

  log('Starting incremental sync for %s', user_base_directory)

  try {
    // Get last sync state (handles backwards compat with old single-SHA format)
    const sync_state = await get_repo_sync_state()

    // Get changed files across all repositories (main + submodules)
    const { changed_files, new_sync_state } = await get_all_changed_files({
      repo_path: user_base_directory,
      sync_state
    })

    log('Found %d total changed files across all repositories', changed_files.length)

    // Filter to entity files
    const entity_file_paths = filter_entity_files({
      file_paths: changed_files,
      entity_directories: ENTITY_DIRECTORIES
    })

    // Filter to thread metadata files
    const thread_file_paths = filter_thread_metadata_files({
      file_paths: changed_files
    })

    log(
      'Found %d entity files and %d thread files to process',
      entity_file_paths.length,
      thread_file_paths.length
    )

    if (entity_file_paths.length === 0 && thread_file_paths.length === 0) {
      log('No changes detected')
      // Update sync state even if no changes
      await set_repo_sync_state({ state: new_sync_state })
      await set_index_metadata({
        key: INDEX_METADATA_KEYS.SCHEMA_VERSION,
        value: CURRENT_SCHEMA_VERSION
      })
      return {
        success: true,
        method: 'no_changes',
        stats: {
          entities_synced: 0,
          entities_deleted: 0,
          threads_synced: 0,
          threads_deleted: 0,
          failed: 0
        }
      }
    }

    log(
      'Incremental sync: %d entity files, %d thread files to process',
      entity_file_paths.length,
      thread_file_paths.length
    )

    // Perform entity sync (handles existence check at sync time)
    const entity_stats = await perform_incremental_sync({
      repo_path: user_base_directory,
      file_paths: entity_file_paths,
      index_manager
    })

    // Perform thread sync (handles existence check at sync time)
    const thread_stats = await sync_changed_threads({
      repo_path: user_base_directory,
      file_paths: thread_file_paths,
      index_manager
    })

    // Combine stats
    const stats = {
      entities_synced: entity_stats.synced,
      entities_deleted: entity_stats.deleted,
      threads_synced: thread_stats.synced,
      threads_deleted: thread_stats.deleted,
      failed: entity_stats.failed + thread_stats.failed
    }

    // Always update sync metadata to advance progress.
    // Individual file failures are logged but don't block overall progress.
    await set_repo_sync_state({ state: new_sync_state })
    await set_index_metadata({
      key: INDEX_METADATA_KEYS.SCHEMA_VERSION,
      value: CURRENT_SCHEMA_VERSION
    })

    if (stats.failed > 0) {
      log(
        'Warning: %d files failed to sync, will retry on next modification',
        stats.failed
      )
    }

    log(
      'Incremental sync complete: %d entities synced, %d deleted; %d threads synced, %d deleted; %d failed',
      stats.entities_synced,
      stats.entities_deleted,
      stats.threads_synced,
      stats.threads_deleted,
      stats.failed
    )

    // Sync is considered successful if it completed without fatal errors.
    return {
      success: true,
      method: 'incremental',
      stats
    }
  } catch (error) {
    log('Incremental sync failed: %s', error.message)
    return {
      success: false,
      method: 'incremental',
      error: error.message,
      stats: {
        entities_synced: 0,
        entities_deleted: 0,
        threads_synced: 0,
        threads_deleted: 0,
        failed: 0
      }
    }
  }
}
