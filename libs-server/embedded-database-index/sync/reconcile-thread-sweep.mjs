import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'

import config from '#config'
import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'
import { execute_sqlite_query } from '#libs-server/embedded-database-index/sqlite/sqlite-database-client.mjs'
import {
  DRIFT_TOLERANCE_MS,
  SYNC_CONCURRENCY,
  run_with_concurrency
} from './sweep-utils.mjs'

const log = debug('embedded-index:sync:reconcile-thread-sweep')

const THREAD_DIR_NAME = 'thread'
const METADATA_FILE_NAME = 'metadata.json'
const STAT_CONCURRENCY = 32

let sweep_in_progress = false

async function build_file_map({ user_base_directory }) {
  const thread_dir = path.join(user_base_directory, THREAD_DIR_NAME)
  const file_map = new Map()

  let entries
  try {
    entries = await fs.readdir(thread_dir, { withFileTypes: true })
  } catch (error) {
    if (error.code !== 'ENOENT') {
      log('Error scanning thread directory: %s', error.message)
    }
    return file_map
  }

  const dir_entries = entries.filter((entry) => entry.isDirectory())
  await run_with_concurrency({
    items: dir_entries,
    limit: STAT_CONCURRENCY,
    worker: async (entry) => {
      const metadata_path = path.join(
        thread_dir,
        entry.name,
        METADATA_FILE_NAME
      )
      try {
        const stat = await fs.stat(metadata_path)
        file_map.set(entry.name, stat.mtimeMs)
      } catch (error) {
        if (error.code !== 'ENOENT') {
          log('Error stat %s: %s', metadata_path, error.message)
        }
      }
    }
  })

  return file_map
}

async function build_db_map() {
  const rows = await execute_sqlite_query({
    query: 'SELECT thread_id, updated_at FROM threads'
  })

  const db_map = new Map()
  for (const row of rows) {
    const ts = Date.parse(row.updated_at ?? '') || 0
    db_map.set(row.thread_id, ts)
  }
  return db_map
}

async function sync_one({
  thread_id,
  user_base_directory,
  db_updated_ms,
  require_newer,
  index_manager
}) {
  const metadata_path = path.join(
    user_base_directory,
    THREAD_DIR_NAME,
    thread_id,
    METADATA_FILE_NAME
  )

  let metadata
  try {
    const raw = await fs.readFile(metadata_path, 'utf8')
    metadata = JSON.parse(raw)
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { synced: false, skipped: true }
    }
    log('Failed to read %s: %s', metadata_path, error.message)
    return { synced: false, error: error.message }
  }

  if (require_newer) {
    const fm_ms = Date.parse(metadata?.updated_at ?? '') || 0
    if (fm_ms > 0 && fm_ms <= db_updated_ms) {
      return { synced: false, skipped: true }
    }
  }

  try {
    await index_manager.sync_thread({ thread_id, metadata })
    return { synced: true }
  } catch (error) {
    log('sync_thread failed for %s: %s', thread_id, error.message)
    return { synced: false, error: error.message }
  }
}

// Single-flight: re-entry while a sweep is active returns {ran: false}.
// Independent from the entity sweep flag so a slow thread walk does not
// block entity reconciliation and vice versa.
export async function run_reconcile_thread_sweep({
  verbose = false,
  user_base_directory: user_base_directory_override,
  index_manager: index_manager_override,
  metrics: metrics_override,
  load_file_map,
  load_db_map,
  remove_orphans
} = {}) {
  if (sweep_in_progress) {
    log('Thread sweep already in progress; skipping re-entry')
    return {
      ran: false,
      missing: 0,
      drift: 0,
      orphaned: 0,
      errors: 0,
      duration_ms: 0
    }
  }

  sweep_in_progress = true
  const start = Date.now()
  const index_manager = index_manager_override || embedded_index_manager
  const metrics = metrics_override || index_manager._metrics
  const user_base_directory =
    user_base_directory_override || config.user_base_directory
  const reconcile_config = config.embedded_index?.reconcile || {}
  const orphan_removal_enabled =
    remove_orphans ?? reconcile_config.thread_remove_orphans ?? false

  let missing_count = 0
  let drift_count = 0
  let orphan_count = 0
  let orphans_detected = 0
  let error_count = 0
  let duration_ms = 0

  try {
    if (metrics) metrics.increment('thread_reconciliations')

    const [file_map, db_map] = await Promise.all([
      load_file_map ? load_file_map() : build_file_map({ user_base_directory }),
      load_db_map ? load_db_map() : build_db_map()
    ])

    log(
      'Thread reconcile scan: %d directories on disk, %d rows in db',
      file_map.size,
      db_map.size
    )

    const sync_tasks = []
    for (const [thread_id, mtime_ms] of file_map) {
      const db_updated_ms = db_map.get(thread_id)
      if (db_updated_ms === undefined || db_updated_ms === 0) {
        sync_tasks.push({ thread_id, kind: 'missing', db_updated_ms: 0 })
      } else if (mtime_ms - db_updated_ms > DRIFT_TOLERANCE_MS) {
        sync_tasks.push({ thread_id, kind: 'drift', db_updated_ms })
      }
    }

    await run_with_concurrency({
      items: sync_tasks,
      limit: SYNC_CONCURRENCY,
      worker: async (task) => {
        const res = await sync_one({
          thread_id: task.thread_id,
          user_base_directory,
          db_updated_ms: task.db_updated_ms,
          require_newer: task.kind === 'drift',
          index_manager
        })
        if (res.synced) {
          if (task.kind === 'missing') missing_count++
          else drift_count++
          if (verbose) log('%s -> synced: %s', task.kind, task.thread_id)
        } else if (res.error) {
          error_count++
        }
      }
    })

    const orphan_ids = []
    for (const thread_id of db_map.keys()) {
      if (!file_map.has(thread_id)) orphan_ids.push(thread_id)
    }
    orphans_detected = orphan_ids.length

    if (orphan_removal_enabled) {
      await run_with_concurrency({
        items: orphan_ids,
        limit: SYNC_CONCURRENCY,
        worker: async (thread_id) => {
          try {
            await index_manager.remove_thread({ thread_id })
            orphan_count++
            if (verbose) log('orphan -> removed: %s', thread_id)
          } catch (error) {
            log('Orphan removal failed %s: %s', thread_id, error.message)
            error_count++
          }
        }
      })
    } else if (orphans_detected > 0) {
      // Default-off: thread/ is a git submodule and a transient detached
      // state could be misread as an orphan. Set
      // embedded_index.reconcile.thread_remove_orphans=true to enable.
      log(
        'Thread orphan removal disabled; %d orphan rows detected',
        orphans_detected
      )
    }

    if (metrics) {
      metrics.increment('thread_reconcile_missing', missing_count)
      metrics.increment('thread_reconcile_drift', drift_count)
      metrics.increment('thread_reconcile_orphans', orphan_count)
      metrics.increment(
        'thread_reconcile_orphans_detected',
        orphans_detected - orphan_count
      )
      metrics.increment('thread_reconcile_errors', error_count)
    }
  } catch (error) {
    log('Thread reconcile sweep failed: %s', error.message)
    error_count++
    if (metrics) metrics.increment('thread_reconcile_errors')
  } finally {
    sweep_in_progress = false
    duration_ms = Date.now() - start
    if (metrics) metrics.timing('thread_reconciliation', duration_ms)
    log(
      'Thread reconcile sweep complete in %d ms: missing=%d drift=%d orphaned=%d orphans_detected=%d errors=%d',
      duration_ms,
      missing_count,
      drift_count,
      orphan_count,
      orphans_detected,
      error_count
    )
  }

  return {
    ran: true,
    missing: missing_count,
    drift: drift_count,
    orphaned: orphan_count,
    orphans_detected,
    errors: error_count,
    duration_ms
  }
}

export function _reset_thread_sweep_state_for_tests() {
  sweep_in_progress = false
}
