import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'

import config from '#config'
import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'
import { execute_sqlite_query } from '#libs-server/embedded-database-index/sqlite/sqlite-database-client.mjs'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import { extract_content_wikilinks_from_entity_metadata } from './entity-data-extractor.mjs'
import {
  ENTITY_DIRECTORIES,
  filter_entity_files,
  get_submodule_exclusion_prefixes
} from './index-sync-filters.mjs'
import {
  DRIFT_TOLERANCE_MS,
  SYNC_CONCURRENCY,
  run_with_concurrency
} from './sweep-utils.mjs'

const log = debug('embedded-index:sync:reconcile-sweep')

let sweep_in_progress = false

async function walk_entity_directory({ user_base_directory, dir_name }) {
  const dir_path = path.join(user_base_directory, dir_name)
  const results = []

  let entries
  try {
    entries = await fs.readdir(dir_path, {
      withFileTypes: true,
      recursive: true
    })
  } catch (error) {
    if (error.code !== 'ENOENT') {
      log('Error scanning %s: %s', dir_name, error.message)
    }
    return results
  }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue
    const absolute_path = path.join(entry.parentPath, entry.name)
    const relative_path = path.relative(user_base_directory, absolute_path)
    try {
      const stat = await fs.stat(absolute_path)
      results.push({ relative_path, mtime_ms: stat.mtimeMs })
    } catch (error) {
      if (error.code !== 'ENOENT') {
        log('Error stat %s: %s', absolute_path, error.message)
      }
    }
  }

  return results
}

async function build_file_map({ user_base_directory }) {
  const raw = []
  for (const dir_name of ENTITY_DIRECTORIES) {
    const entries = await walk_entity_directory({
      user_base_directory,
      dir_name
    })
    raw.push(...entries)
    await new Promise((resolve) => setImmediate(resolve))
  }

  const submodule_exclusions = await get_submodule_exclusion_prefixes()
  const file_paths = raw.map((r) => r.relative_path)
  const filtered = new Set(
    filter_entity_files({
      file_paths,
      entity_directories: ENTITY_DIRECTORIES,
      submodule_exclusions
    })
  )

  const file_map = new Map()
  for (const { relative_path, mtime_ms } of raw) {
    if (!filtered.has(relative_path)) continue
    file_map.set(`user:${relative_path}`, mtime_ms)
  }
  return file_map
}

async function build_db_map() {
  const rows = await execute_sqlite_query({
    query: 'SELECT base_uri, updated_at FROM entities'
  })

  const db_map = new Map()
  for (const row of rows) {
    const ts = Date.parse(row.updated_at ?? '') || 0
    db_map.set(row.base_uri, ts)
  }
  return db_map
}

async function sync_one({
  base_uri,
  user_base_directory,
  db_updated_ms,
  require_newer,
  index_manager
}) {
  const relative_path = base_uri.replace(/^user:/, '')
  const absolute_path = path.join(user_base_directory, relative_path)

  const result = await read_entity_from_filesystem({ absolute_path })
  if (!result.success) {
    log('Failed to read %s: %s', base_uri, result.error)
    return { synced: false, error: result.error }
  }

  if (require_newer) {
    const fm_ms = Date.parse(result.entity_properties?.updated_at ?? '') || 0
    if (fm_ms > 0 && fm_ms <= db_updated_ms) {
      return { synced: false, skipped: true }
    }
  }

  const sync_result = await index_manager.sync_entity({
    base_uri,
    entity_data: result.entity_properties,
    entity_content: result.entity_content,
    content_wikilink_targets: extract_content_wikilinks_from_entity_metadata({
      formatted_entity_metadata: result.formatted_entity_metadata
    })
  })

  if (sync_result && sync_result.success === false) {
    return { synced: false, error: 'sync_entity failed' }
  }
  return { synced: true }
}

// Single-flight: re-entry while a sweep is active returns {ran: false}.
export async function run_reconcile_sweep({
  verbose = false,
  user_base_directory: user_base_directory_override,
  index_manager: index_manager_override,
  metrics: metrics_override,
  load_file_map,
  load_db_map
} = {}) {
  if (sweep_in_progress) {
    log('Sweep already in progress; skipping re-entry')
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

  let missing_count = 0
  let drift_count = 0
  let orphan_count = 0
  let error_count = 0
  let duration_ms = 0

  try {
    if (metrics) metrics.increment('reconciliations')

    const [file_map, db_map] = await Promise.all([
      load_file_map ? load_file_map() : build_file_map({ user_base_directory }),
      load_db_map ? load_db_map() : build_db_map()
    ])

    log(
      'Reconcile scan: %d files on disk, %d rows in db',
      file_map.size,
      db_map.size
    )

    const sync_tasks = []
    for (const [base_uri, mtime_ms] of file_map) {
      const db_updated_ms = db_map.get(base_uri)
      // Treat rows with no/unparseable updated_at (db_updated_ms === 0) as
      // missing so they are re-synced unconditionally rather than being
      // silently skipped by the require_newer check.
      if (db_updated_ms === undefined || db_updated_ms === 0) {
        sync_tasks.push({ base_uri, kind: 'missing', db_updated_ms: 0 })
      } else if (mtime_ms - db_updated_ms > DRIFT_TOLERANCE_MS) {
        sync_tasks.push({ base_uri, kind: 'drift', db_updated_ms })
      }
    }

    await run_with_concurrency({
      items: sync_tasks,
      limit: SYNC_CONCURRENCY,
      worker: async (task) => {
        const res = await sync_one({
          base_uri: task.base_uri,
          user_base_directory,
          db_updated_ms: task.db_updated_ms,
          require_newer: task.kind === 'drift',
          index_manager
        })
        if (res.synced) {
          if (task.kind === 'missing') missing_count++
          else drift_count++
          if (verbose) log('%s -> synced: %s', task.kind, task.base_uri)
        } else if (res.error) {
          error_count++
        }
      }
    })

    const orphan_uris = []
    for (const base_uri of db_map.keys()) {
      if (!file_map.has(base_uri)) orphan_uris.push(base_uri)
    }
    await run_with_concurrency({
      items: orphan_uris,
      limit: SYNC_CONCURRENCY,
      worker: async (base_uri) => {
        try {
          await index_manager.remove_entity({ base_uri })
          orphan_count++
          if (verbose) log('orphan -> removed: %s', base_uri)
        } catch (error) {
          log('Orphan removal failed %s: %s', base_uri, error.message)
          error_count++
        }
      }
    })

    if (metrics) {
      metrics.increment('reconcile_missing', missing_count)
      metrics.increment('reconcile_drift', drift_count)
      metrics.increment('reconcile_orphans', orphan_count)
      metrics.increment('reconcile_errors', error_count)
    }
  } catch (error) {
    log('Reconcile sweep failed: %s', error.message)
    error_count++
    if (metrics) metrics.increment('reconcile_errors')
  } finally {
    sweep_in_progress = false
    duration_ms = Date.now() - start
    if (metrics) metrics.timing('reconciliation', duration_ms)
    log(
      'Reconcile sweep complete in %d ms: missing=%d drift=%d orphaned=%d errors=%d',
      duration_ms,
      missing_count,
      drift_count,
      orphan_count,
      error_count
    )
  }

  return {
    ran: true,
    missing: missing_count,
    drift: drift_count,
    orphaned: orphan_count,
    errors: error_count,
    duration_ms
  }
}

export function _reset_sweep_state_for_tests() {
  sweep_in_progress = false
}
