/**
 * Migrate to schema v8
 *
 * Non-destructive migration: entity_embeddings are preserved. The migration:
 *
 *   1. Adds body TEXT to entities (idempotent).
 *   2. Drops and recreates entities_fts / threads_fts with the new tokenizer
 *      (and body column on entities_fts) plus matching triggers.
 *   3. Creates thread_timeline + thread_timeline_fts + triggers.
 *   4. Rebuilds entities_fts and threads_fts from the base tables.
 *   5. Populates the new body column from filesystem.
 *   6. Populates thread_timeline from each thread's timeline.jsonl.
 *   7. Writes SCHEMA_VERSION only after population succeeds; an interrupted
 *      migration leaves the prior version pinned so the next startup retries.
 */

import debug from 'debug'

import {
  execute_sqlite_query,
  execute_sqlite_run,
  get_sqlite_database
} from '../sqlite-database-client.mjs'
import {
  get_index_metadata,
  set_index_metadata,
  INDEX_METADATA_KEYS
} from '../sqlite-metadata-operations.mjs'
import { SCHEMA_SQL } from '../sqlite-schema-definitions.mjs'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import { resolve_base_uri } from '#libs-server/base-uri/base-uri-utilities.mjs'
import { sync_all_thread_timelines } from '#libs-server/embedded-database-index/sync/sync-thread-timeline.mjs'

const log = debug('embedded-index:migrations:v8')

export const TARGET_SCHEMA_VERSION = '8'

const FTS_TRIGGER_NAMES = [
  'entities_ai',
  'entities_ad',
  'entities_au',
  'threads_ai',
  'threads_ad',
  'threads_au',
  'thread_timeline_ai',
  'thread_timeline_ad',
  'thread_timeline_au'
]

async function entities_has_body_column() {
  const rows = await execute_sqlite_query({
    query: "PRAGMA table_info('entities')"
  })
  return rows.some((row) => row.name === 'body')
}

async function apply_schema_changes_exclusive() {
  const db = get_sqlite_database()
  db.exec('BEGIN EXCLUSIVE')
  try {
    if (!(await entities_has_body_column())) {
      await execute_sqlite_run({
        query: 'ALTER TABLE entities ADD COLUMN body TEXT'
      })
    }

    for (const trigger of FTS_TRIGGER_NAMES) {
      await execute_sqlite_run({
        query: `DROP TRIGGER IF EXISTS ${trigger}`
      })
    }

    await execute_sqlite_run({ query: 'DROP TABLE IF EXISTS entities_fts' })
    await execute_sqlite_run({ query: 'DROP TABLE IF EXISTS threads_fts' })
    await execute_sqlite_run({
      query: 'DROP TABLE IF EXISTS thread_timeline_fts'
    })
    await execute_sqlite_run({ query: 'DROP TABLE IF EXISTS thread_timeline' })

    await execute_sqlite_run({ query: SCHEMA_SQL.ENTITIES_FTS_TABLE })
    await execute_sqlite_run({ query: SCHEMA_SQL.THREADS_FTS_TABLE })
    await execute_sqlite_run({ query: SCHEMA_SQL.THREAD_TIMELINE_TABLE_SCHEMA })
    for (const index_sql of SCHEMA_SQL.THREAD_TIMELINE_INDEXES) {
      await execute_sqlite_run({ query: index_sql })
    }
    await execute_sqlite_run({ query: SCHEMA_SQL.THREAD_TIMELINE_FTS_TABLE })

    for (const trigger_sql of SCHEMA_SQL.ENTITIES_FTS_TRIGGERS) {
      await execute_sqlite_run({ query: trigger_sql })
    }
    for (const trigger_sql of SCHEMA_SQL.THREADS_FTS_TRIGGERS) {
      await execute_sqlite_run({ query: trigger_sql })
    }
    for (const trigger_sql of SCHEMA_SQL.THREAD_TIMELINE_FTS_TRIGGERS) {
      await execute_sqlite_run({ query: trigger_sql })
    }

    db.exec('COMMIT')
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // ROLLBACK may fail if the txn already aborted; ignore
    }
    throw error
  }
}

async function rebuild_fts_indexes() {
  await execute_sqlite_run({
    query: "INSERT INTO entities_fts(entities_fts) VALUES('rebuild')"
  })
  await execute_sqlite_run({
    query: "INSERT INTO threads_fts(threads_fts) VALUES('rebuild')"
  })
}

async function populate_body_column() {
  const rows = await execute_sqlite_query({
    query: 'SELECT base_uri FROM entities WHERE body IS NULL'
  })
  log('Populating body for %d entities', rows.length)

  let updated = 0
  for (const row of rows) {
    let absolute_path
    try {
      absolute_path = resolve_base_uri(row.base_uri)
    } catch (error) {
      log('Skipping %s: %s', row.base_uri, error.message)
      continue
    }

    const entity_result = await read_entity_from_filesystem({ absolute_path })
    if (!entity_result.success) {
      log('Skipping %s: %s', row.base_uri, entity_result.error)
      continue
    }

    await execute_sqlite_run({
      query: 'UPDATE entities SET body = ? WHERE base_uri = ?',
      parameters: [entity_result.entity_content ?? null, row.base_uri]
    })
    updated++
  }

  log('Body populated for %d / %d entities', updated, rows.length)
  return { total: rows.length, updated }
}

/**
 * Run the v8 migration. Safe to call when already on v8 (no-op on schema; still
 * re-runs population which is idempotent).
 *
 * @param {Object} params
 * @param {string} params.user_base_directory
 * @returns {Promise<{ran: boolean, body: Object, timeline: Object}>}
 */
export async function migrate_to_v8({ user_base_directory }) {
  log('Migrating to schema v8')

  await apply_schema_changes_exclusive()
  await rebuild_fts_indexes()

  const body = await populate_body_column()
  const timeline = await sync_all_thread_timelines({ user_base_directory })

  await set_index_metadata({
    key: INDEX_METADATA_KEYS.SCHEMA_VERSION,
    value: TARGET_SCHEMA_VERSION
  })

  log('Migration to v8 complete')
  return { ran: true, body, timeline }
}

/**
 * Decide whether migration should run. Runs when stored version is present and
 * less than the target; skips when stored version is absent (fresh DB: reset
 * path handles creation) or already at target.
 */
export async function should_run_v8_migration() {
  const stored = await get_index_metadata({
    key: INDEX_METADATA_KEYS.SCHEMA_VERSION
  })
  if (stored == null) return false
  if (stored === TARGET_SCHEMA_VERSION) return false
  return true
}
