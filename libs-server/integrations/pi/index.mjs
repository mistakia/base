/**
 * Pi Integration -- public exports for CLI and unified import pipeline.
 */

import debug from 'debug'

import { PiSessionProvider, PI_DEFAULT_SESSIONS_DIR } from './pi-session-provider.mjs'
import { create_threads_from_session_provider } from '#libs-server/integrations/thread/create-threads-from-session-provider.mjs'
import {
  load_pi_sync_state,
  save_pi_sync_state
} from './pi-sync-state.mjs'
import { import_pi_session_delta } from './import-pi-session-delta.mjs'
import { TIMELINE_SCHEMA_VERSION } from '#libs-shared/timeline-schema-version.mjs'
import {
  parse_pi_jsonl,
  migrate_pi_entries
} from './pi-session-helpers.mjs'
import { extract_all_pi_branches } from './pi-tree.mjs'
import fs from 'fs/promises'

export { PiSessionProvider, PI_DEFAULT_SESSIONS_DIR }
export { link_pi_branches } from './pi-branch-linker.mjs'
export {
  get_unsupported_summary as get_pi_unsupported,
  clear_unsupported_tracking as clear_pi_unsupported
} from './normalize-pi-session.mjs'
export { import_pi_session_delta } from './import-pi-session-delta.mjs'

const log = debug('integrations:pi')

export const list_pi_sessions = async (options = {}) => {
  const provider = new PiSessionProvider()
  const sessions = await provider.find_sessions({
    pi_sessions_dir: options.pi_sessions_dir,
    pi_sessions_dirs: options.pi_sessions_dirs,
    from_date: options.from_date,
    to_date: options.to_date
  })
  // Group branches by header.id for display ergonomics.
  const grouped = new Map()
  for (const s of sessions) {
    const id = s.header.id
    if (!grouped.has(id)) {
      grouped.set(id, {
        session_id: id,
        project_path: s.project_path,
        file_path: s.file_path,
        version: s.header.version,
        branch_count: 0,
        entry_count: 0
      })
    }
    const group = grouped.get(id)
    group.branch_count++
    group.entry_count += s.branch_entries.length
  }
  return Array.from(grouped.values())
}

export const import_pi_sessions = async (options = {}) => {
  log('Starting Pi session import')

  if (options.dry_run) {
    const provider = new PiSessionProvider()
    let valid = 0
    let invalid = 0
    let total = 0
    for await (const session of provider.stream_sessions({
      session_file: options.session_file,
      pi_sessions_dir: options.pi_sessions_dir,
      pi_sessions_dirs: options.pi_sessions_dirs,
      from_date: options.from_date,
      to_date: options.to_date,
      single_leaf_only: options.single_leaf_only
    })) {
      total++
      const v = provider.validate_session(session)
      if (v.valid) valid++
      else invalid++
    }
    return {
      dry_run: true,
      sessions_found: total,
      valid_sessions: valid,
      invalid_sessions: invalid
    }
  }

  // Live-sync delta path: when caller targets a single session_file with a
  // known thread id and we have a sync-state cache, attempt the append-only
  // delta path. On any fall-through or throw, fall through to the full path.
  if (options.session_file && options.known_thread_id) {
    const sync_state = await load_pi_sync_state({
      session_file: options.session_file
    })
    if (sync_state) {
      try {
        const delta_result = await import_pi_session_delta({
          session_file: options.session_file,
          known_thread_id: options.known_thread_id,
          sync_state
        })
        if (!delta_result.fall_through) {
          return {
            sessions_found: 1,
            valid_sessions: 1,
            invalid_sessions: 0,
            threads_created: 0,
            threads_updated: delta_result.timeline_modified ? 1 : 0,
            threads_failed: 0,
            threads_skipped: delta_result.no_change ? 1 : 0,
            branches_found: 1,
            delta: true,
            appended: delta_result.appended,
            no_change: delta_result.no_change || false
          }
        }
        log(`Delta fell through (${delta_result.reason}); running full import`)
      } catch (error) {
        log(`Delta path threw: ${error.message}; falling back to full import`)
      }
    }
  }

  const results = await create_threads_from_session_provider({
    provider_name: 'pi',
    user_base_directory: options.user_base_directory,
    verbose: options.verbose,
    allow_updates: options.allow_updates,
    merge_agents: false,
    include_warm_agents: false,
    known_thread_id: options.known_thread_id,
    provider_options: {
      session_file: options.session_file,
      pi_sessions_dir: options.pi_sessions_dir,
      pi_sessions_dirs: options.pi_sessions_dirs,
      from_date: options.from_date,
      to_date: options.to_date,
      single_leaf_only: options.single_leaf_only
    },
    bulk_import: options.bulk_import !== false
  })

  const sessions_processed =
    results.summary?.total ??
    results.created.length +
      results.updated.length +
      results.skipped.length +
      results.failed.length

  // After a successful full path on a single session_file, persist sync state
  // so the next tick can take the delta path. Failure here is non-fatal --
  // the next tick will simply fall through to full again.
  if (
    options.session_file &&
    options.known_thread_id &&
    results.failed.length === 0 &&
    (results.created.length + results.updated.length) === 1
  ) {
    try {
      const stat = await fs.stat(options.session_file)
      const { header, entries } = await parse_pi_jsonl({
        file_path: options.session_file
      })
      const migrated = migrate_pi_entries({ header, entries })
      const branches = extract_all_pi_branches({ entries: migrated })
      if (branches.length > 0) {
        const active = branches[0]
        await save_pi_sync_state({
          session_file: options.session_file,
          state: {
            byte_offset: stat.size,
            last_entry_id: active.leaf_entry.id,
            leaf_id: active.leaf_entry.id,
            branch_thread_id: options.known_thread_id,
            schema_version: TIMELINE_SCHEMA_VERSION
          }
        })
      }
    } catch (error) {
      log(`Failed to persist post-full-import sync state: ${error.message}`)
    }
  }

  return {
    sessions_found: sessions_processed + (results.invalid_sessions_count || 0),
    valid_sessions: sessions_processed,
    invalid_sessions: results.invalid_sessions_count || 0,
    threads_created: results.created.length,
    threads_updated: results.updated.length,
    threads_failed: results.failed.length,
    threads_skipped: results.skipped.length,
    branches_found: sessions_processed,
    success_rate: results.summary?.success_rate,
    results
  }
}
