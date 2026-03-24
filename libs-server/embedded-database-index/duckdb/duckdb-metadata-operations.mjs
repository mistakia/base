/**
 * DuckDB Metadata Operations
 *
 * CRUD operations for the index_metadata table used to track sync state.
 */

import debug from 'debug'

import {
  execute_duckdb_query,
  execute_duckdb_run
} from './duckdb-database-client.mjs'

const log = debug('embedded-index:duckdb:metadata')

/**
 * Get a single metadata value by key
 * @param {Object} params
 * @param {string} params.key - The metadata key to retrieve
 * @returns {Promise<string|null>} The value or null if not found
 */
export async function get_index_metadata({ key }) {
  log('Getting metadata for key: %s', key)

  const result = await execute_duckdb_query({
    query: 'SELECT value FROM index_metadata WHERE key = ?',
    parameters: [key]
  })

  if (result.length === 0) {
    return null
  }

  return result[0].value
}

/**
 * Set (upsert) a metadata value
 * @param {Object} params
 * @param {string} params.key - The metadata key
 * @param {string} params.value - The value to store
 * @returns {Promise<void>}
 */
export async function set_index_metadata({ key, value }) {
  log('Setting metadata for key: %s', key)

  const updated_at = new Date().toISOString()

  await execute_duckdb_run({
    query: `
      INSERT INTO index_metadata (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = EXCLUDED.updated_at
    `,
    parameters: [key, value, updated_at]
  })
}

/**
 * Get all metadata as an object
 * @returns {Promise<Object>} Object with key-value pairs
 */
export async function get_all_index_metadata() {
  log('Getting all metadata')

  const result = await execute_duckdb_query({
    query: 'SELECT key, value, updated_at FROM index_metadata'
  })

  const metadata_object = {}
  for (const row of result) {
    metadata_object[row.key] = row.value
  }

  return metadata_object
}

/**
 * Metadata keys used by the sync system.
 * External consumers should only use SCHEMA_VERSION and REPO_SYNC_STATE.
 */
export const INDEX_METADATA_KEYS = {
  // Internal: used for backwards-compat migration from old single-SHA format
  LAST_SYNC_COMMIT_SHA: 'last_sync_commit_sha',
  // Internal: updated by set_repo_sync_state
  LAST_SYNC_TIMESTAMP: 'last_sync_timestamp',
  // Public: check/set schema version
  SCHEMA_VERSION: 'schema_version',
  // Public: per-repository sync state as JSON { ".": { sha }, "submodule": { sha } }
  REPO_SYNC_STATE: 'repo_sync_state',
  // Public: per-repository git activity sync state as JSON { "repo_path": { sha } }
  ACTIVITY_GIT_SYNC_STATE: 'activity_git_sync_state'
}

/**
 * Current schema version - increment when schema changes require rebuild
 * v3: Changed token fields from INTEGER to BIGINT to handle large token counts
 * v4: Added file_references and directory_references columns to threads table
 * v5: Renamed session_provider to source_provider
 * v6: Added external_session_id column to threads table
 */
export const CURRENT_SCHEMA_VERSION = '6'

/**
 * Get repository sync state (handles backwards compatibility)
 *
 * Returns per-repository sync state. If only the old single-SHA format exists,
 * migrates it to the new format with the main repo (".") entry.
 *
 * @returns {Promise<Object>} Object mapping relative_path to { sha }
 *   Example: { ".": { sha: "abc123" }, "thread": { sha: "def456" } }
 */
export async function get_repo_sync_state() {
  log('Getting repository sync state')

  // Try to get new multi-repo format first
  const repo_state_json = await get_index_metadata({
    key: INDEX_METADATA_KEYS.REPO_SYNC_STATE
  })

  if (repo_state_json) {
    try {
      return JSON.parse(repo_state_json)
    } catch (error) {
      log('Failed to parse repo_sync_state JSON: %s', error.message)
    }
  }

  // Fall back to old single-SHA format for backwards compatibility
  const old_sha = await get_index_metadata({
    key: INDEX_METADATA_KEYS.LAST_SYNC_COMMIT_SHA
  })

  if (old_sha) {
    log('Migrating from old single-SHA format')
    return { '.': { sha: old_sha } }
  }

  // No sync state exists yet
  return {}
}

/**
 * Set repository sync state
 *
 * Stores per-repository sync state and updates the timestamp.
 * Also clears the deprecated single-SHA key if it exists.
 *
 * @param {Object} params
 * @param {Object} params.state - Object mapping relative_path to { sha }
 * @returns {Promise<void>}
 */
export async function set_repo_sync_state({ state }) {
  log(
    'Setting repository sync state for %d repositories',
    Object.keys(state).length
  )

  const state_json = JSON.stringify(state)

  await set_index_metadata({
    key: INDEX_METADATA_KEYS.REPO_SYNC_STATE,
    value: state_json
  })

  // Update timestamp
  await set_index_metadata({
    key: INDEX_METADATA_KEYS.LAST_SYNC_TIMESTAMP,
    value: new Date().toISOString()
  })
}
