/**
 * SQLite Metadata Operations
 *
 * CRUD operations for the index_metadata table used to track sync state.
 */

import debug from 'debug'

import {
  execute_sqlite_query,
  execute_sqlite_run
} from './sqlite-database-client.mjs'

const log = debug('embedded-index:sqlite:metadata')

export async function get_index_metadata({ key }) {
  log('Getting metadata for key: %s', key)

  const result = await execute_sqlite_query({
    query: 'SELECT value FROM index_metadata WHERE key = ?',
    parameters: [key]
  })

  if (result.length === 0) {
    return null
  }

  return result[0].value
}

export async function set_index_metadata({ key, value }) {
  if (value === null || value === undefined) {
    throw new TypeError(
      `set_index_metadata: value must be a non-null string (key=${key})`
    )
  }

  log('Setting metadata for key: %s', key)

  const updated_at = new Date().toISOString()

  await execute_sqlite_run({
    query: `
      INSERT INTO index_metadata (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT (key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `,
    parameters: [key, value, updated_at]
  })
}

export async function get_all_index_metadata() {
  log('Getting all metadata')

  const result = await execute_sqlite_query({
    query: 'SELECT key, value, updated_at FROM index_metadata'
  })

  const metadata_object = {}
  for (const row of result) {
    metadata_object[row.key] = row.value
  }

  return metadata_object
}

export const INDEX_METADATA_KEYS = {
  LAST_SYNC_COMMIT_SHA: 'last_sync_commit_sha',
  LAST_SYNC_TIMESTAMP: 'last_sync_timestamp',
  SCHEMA_VERSION: 'schema_version',
  REPO_SYNC_STATE: 'repo_sync_state',
  ACTIVITY_GIT_SYNC_STATE: 'activity_git_sync_state',
  REBUILD_IN_PROGRESS: 'rebuild_in_progress'
}

/**
 * Current schema version - increment when schema changes require rebuild
 * v3: Changed token fields from INTEGER to BIGINT
 * v4: Added file_references and directory_references columns to threads table
 * v5: Renamed session_provider to source_provider
 * v6: Added external_session_id column to threads table
 * v7: Added has_continuation_prompt and continuation_prompt_count columns to threads table
 */
export const CURRENT_SCHEMA_VERSION = '7'

export async function get_repo_sync_state() {
  log('Getting repository sync state')

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

  const old_sha = await get_index_metadata({
    key: INDEX_METADATA_KEYS.LAST_SYNC_COMMIT_SHA
  })

  if (old_sha) {
    log('Migrating from old single-SHA format')
    return { '.': { sha: old_sha } }
  }

  return {}
}

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

  await set_index_metadata({
    key: INDEX_METADATA_KEYS.LAST_SYNC_TIMESTAMP,
    value: new Date().toISOString()
  })
}
