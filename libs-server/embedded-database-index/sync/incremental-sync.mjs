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
import { checkpoint_sqlite } from '#libs-server/embedded-database-index/sqlite/sqlite-database-client.mjs'
import {
  set_index_metadata,
  INDEX_METADATA_KEYS,
  CURRENT_SCHEMA_VERSION,
  get_repo_sync_state,
  set_repo_sync_state
} from '#libs-server/embedded-database-index/sqlite/sqlite-metadata-operations.mjs'
import {
  ENTITY_DIRECTORIES,
  filter_entity_files,
  filter_thread_metadata_files,
  extract_thread_id_from_path,
  get_submodule_exclusion_prefixes
} from './index-sync-filters.mjs'
import { get_all_changed_files } from './repository-discovery.mjs'
import { sync_git_activity_incremental } from './sync-git-activity.mjs'

const log = debug('embedded-index:sync:incremental')

/**
 * Check if an error indicates file not found (ENOENT)
 */
function is_file_not_found_error(error) {
  if (error?.code === 'ENOENT') return true
  if (typeof error === 'string') {
    return (
      error.includes('ENOENT') ||
      error.includes('no such file') ||
      error.includes('File not found')
    )
  }
  return false
}

/**
 * Error codes that indicate expected/recoverable failures.
 * These are skipped rather than counted as hard failures that block sync.
 * - NO_FRONTMATTER: Non-entity markdown files that passed filtering
 * - MISSING_TYPE: Files with frontmatter but no entity type
 * - PARSE_ERROR: Malformed YAML frontmatter (user data issue, not infrastructure)
 */
const EXPECTED_FAILURE_CODES = new Set([
  'NO_FRONTMATTER',
  'MISSING_TYPE',
  'PARSE_ERROR'
])

/**
 * Check if a read failure is an expected failure (non-entity file that passed filtering).
 * Uses error_code when available, falls back to pattern matching for backwards compatibility.
 * @param {Object} result - The read_entity_from_filesystem result
 * @returns {boolean}
 */
function is_expected_failure(result) {
  if (result.error_code) {
    return EXPECTED_FAILURE_CODES.has(result.error_code)
  }
  // Fallback for results without error_code
  return result.error?.includes('No entity type found') || false
}

/**
 * Sync a single entity file (add/modify/delete).
 * @returns {Promise<{action: 'synced'|'deleted'|'skipped'|'failed', error?: string, reason?: string}>}
 */
async function sync_entity_file({ file_path, repo_path, index_manager }) {
  const absolute_path = path.join(repo_path, file_path)
  const base_uri = `user:${file_path}`

  try {
    const result = await read_entity_from_filesystem({ absolute_path })

    if (!result.success) {
      if (is_file_not_found_error(result.error)) {
        await index_manager.remove_entity({ base_uri })
        log('Deleted (file not found): %s', base_uri)
        return { action: 'deleted' }
      }

      // Check if this is an expected failure (non-entity file)
      if (is_expected_failure(result)) {
        log('Skipped non-entity file %s: %s', file_path, result.error)
        return { action: 'skipped', reason: result.error }
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
    if (is_file_not_found_error(error)) {
      await index_manager.remove_entity({ base_uri })
      log('Deleted (ENOENT): %s', base_uri)
      return { action: 'deleted' }
    }
    log('Error syncing %s: %s', file_path, error.message)
    return { action: 'failed', error: error.message }
  }
}

/**
 * Perform incremental sync for changed entity files.
 *
 * Concurrency: the sync lock in embedded-index-manager prevents concurrent syncs.
 * SQLite WAL mode provides read isolation for queries during sync --
 * readers see a consistent snapshot and are not blocked by in-progress writes.
 *
 * @returns {Promise<{synced: number, deleted: number, skipped: number, failed: number, skipped_details: Array}>}
 */
export async function perform_incremental_sync({
  repo_path,
  file_paths,
  index_manager
}) {
  const stats = { synced: 0, deleted: 0, skipped: 0, failed: 0 }
  const skipped_details = []

  for (const file_path of file_paths) {
    const result = await sync_entity_file({
      file_path,
      repo_path,
      index_manager
    })
    stats[result.action]++

    if (result.action === 'skipped') {
      skipped_details.push({ file_path, reason: result.reason })
    }
  }

  return { ...stats, skipped_details }
}

/**
 * Sync a single thread metadata file (add/modify/delete).
 * @returns {Promise<{action: 'synced'|'deleted'|'skipped'|'failed', error?: string, reason?: string}>}
 */
async function sync_thread_file({ file_path, repo_path, index_manager }) {
  const thread_id = extract_thread_id_from_path(file_path)
  if (!thread_id) {
    // Invalid thread path is a skipped condition, not a failure
    // This can happen with malformed directory names
    log('Skipped invalid thread path (malformed UUID): %s', file_path)
    return { action: 'skipped', reason: 'Invalid thread path - malformed UUID' }
  }

  const absolute_path = path.join(repo_path, file_path)

  try {
    const content = await fs.readFile(absolute_path, 'utf-8')
    const metadata = JSON.parse(content)

    await index_manager.sync_thread({ thread_id, metadata })
    log('Synced thread: %s', thread_id)
    return { action: 'synced' }
  } catch (error) {
    if (is_file_not_found_error(error)) {
      await index_manager.remove_thread({ thread_id })
      log('Deleted thread (ENOENT): %s', thread_id)
      return { action: 'deleted' }
    }
    log('Error syncing thread %s: %s', file_path, error.message)
    return { action: 'failed', error: error.message }
  }
}

/**
 * Sync changed thread metadata files.
 * @returns {Promise<{synced: number, deleted: number, skipped: number, failed: number, skipped_details: Array}>}
 */
async function sync_changed_threads({ repo_path, file_paths, index_manager }) {
  const stats = { synced: 0, deleted: 0, skipped: 0, failed: 0 }
  const skipped_details = []

  for (const file_path of file_paths) {
    const result = await sync_thread_file({
      file_path,
      repo_path,
      index_manager
    })
    stats[result.action]++

    if (result.action === 'skipped') {
      skipped_details.push({ file_path, reason: result.reason })
    }
  }

  return { ...stats, skipped_details }
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

    log(
      'Found %d total changed files across all repositories',
      changed_files.length
    )

    // Filter to entity files (with user-configured submodule exclusions)
    const submodule_exclusions = await get_submodule_exclusion_prefixes()
    const entity_file_paths = filter_entity_files({
      file_paths: changed_files,
      entity_directories: ENTITY_DIRECTORIES,
      submodule_exclusions
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
      log('No entity/thread changes detected, checking git activity')

      // Still sync git activity even if no entity/thread changes
      let git_activity_stats = { repos_synced: 0, dates_updated: 0 }
      try {
        const git_result = await sync_git_activity_incremental()
        if (git_result.success) {
          git_activity_stats = {
            repos_synced: git_result.repos_synced,
            dates_updated: git_result.dates_updated
          }
        }
      } catch (error) {
        log('Git activity sync error: %s', error.message)
      }

      // Update sync state even if no changes
      await set_repo_sync_state({ state: new_sync_state })
      await set_index_metadata({
        key: INDEX_METADATA_KEYS.SCHEMA_VERSION,
        value: CURRENT_SCHEMA_VERSION
      })
      // Force checkpoint to persist schema version
      await checkpoint_sqlite()
      return {
        success: true,
        method: 'no_changes',
        stats: {
          entities_synced: 0,
          entities_deleted: 0,
          entities_skipped: 0,
          threads_synced: 0,
          threads_deleted: 0,
          threads_skipped: 0,
          git_repos_synced: git_activity_stats.repos_synced,
          git_dates_updated: git_activity_stats.dates_updated,
          failed: 0,
          skipped: 0
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

    // Sync git activity incrementally
    let git_activity_stats = { repos_synced: 0, dates_updated: 0 }
    try {
      const git_result = await sync_git_activity_incremental()
      if (git_result.success) {
        git_activity_stats = {
          repos_synced: git_result.repos_synced,
          dates_updated: git_result.dates_updated
        }
      }
    } catch (error) {
      log('Git activity sync error: %s', error.message)
    }

    // Combine stats
    const stats = {
      entities_synced: entity_stats.synced,
      entities_deleted: entity_stats.deleted,
      entities_skipped: entity_stats.skipped,
      threads_synced: thread_stats.synced,
      threads_deleted: thread_stats.deleted,
      threads_skipped: thread_stats.skipped,
      git_repos_synced: git_activity_stats.repos_synced,
      git_dates_updated: git_activity_stats.dates_updated,
      failed: entity_stats.failed + thread_stats.failed,
      skipped: entity_stats.skipped + thread_stats.skipped
    }

    // Always update schema version to reflect current code version
    await set_index_metadata({
      key: INDEX_METADATA_KEYS.SCHEMA_VERSION,
      value: CURRENT_SCHEMA_VERSION
    })

    // Collect all skipped details for logging
    const all_skipped_details = [
      ...entity_stats.skipped_details,
      ...thread_stats.skipped_details
    ]

    // Only block sync state advancement for actual failures, not skipped files
    // Skipped files are expected (non-entity markdown files, malformed thread paths)
    if (stats.failed === 0) {
      await set_repo_sync_state({ state: new_sync_state })
      if (stats.skipped > 0) {
        log('Skipped %d files during sync:', stats.skipped)
        for (const { file_path, reason } of all_skipped_details) {
          log('  - %s: %s', file_path, reason)
        }
      }
    } else {
      log(
        'Warning: %d files failed to sync (plus %d skipped), sync state not advanced',
        stats.failed,
        stats.skipped
      )
      if (all_skipped_details.length > 0) {
        log('Skipped files:')
        for (const { file_path, reason } of all_skipped_details) {
          log('  - %s: %s', file_path, reason)
        }
      }
    }

    await checkpoint_sqlite()

    log(
      'Incremental sync complete: entities(%d synced, %d deleted, %d skipped); threads(%d synced, %d deleted, %d skipped); %d failed',
      stats.entities_synced,
      stats.entities_deleted,
      stats.entities_skipped,
      stats.threads_synced,
      stats.threads_deleted,
      stats.threads_skipped,
      stats.failed
    )

    return {
      success: stats.failed === 0,
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
