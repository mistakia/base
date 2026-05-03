/**
 * Pi Delta Importer
 *
 * Live-sync fast path for Pi sessions. Invoked from `import_pi_sessions`
 * when both `session_file` and `known_thread_id` are supplied AND a
 * `pi-sync-state` cache is present for that file. Falls through to the
 * full path (and clears the cache) on schema mismatch, branch switch,
 * or any unexpected error.
 *
 * Design:
 * - Whole-file parse + normalize via the existing batch primitives
 *   (`parse_pi_jsonl` + `normalize_pi_session`). The perf win comes from
 *   *append-only* timeline writes via `build_timeline_from_session(parse_mode='delta')`,
 *   not from suffix parsing. Pi files are bounded; whole-file parsing
 *   stays well under the 200ms p95 budget after the first tick (page cache).
 * - Dedup by deterministic timeline-entry id (`message.id` from
 *   `normalize_pi_entry`). Existing on-disk SESSION_IMPORT entries that
 *   are absent from the new normalize signal a branch switch -> full path.
 * - Aggregates are recomputed from the full normalized message set every
 *   tick, so delta and batch produce identical thread metadata.
 * - Sync state commit is the *last* write so any earlier failure leaves
 *   the next tick to converge by re-deduping (idempotent).
 */

import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'

import { parse_pi_jsonl, migrate_pi_entries } from './pi-session-helpers.mjs'
import { extract_all_pi_branches } from './pi-tree.mjs'
import {
  normalize_pi_session,
  compose_pi_branch_session_id
} from './normalize-pi-session.mjs'
import { build_timeline_from_session } from '#libs-server/integrations/thread/build-timeline-entries.mjs'
import { update_thread_metadata } from '#libs-server/integrations/thread/create-from-session.mjs'
import { read_timeline_jsonl_or_default } from '#libs-server/threads/timeline/timeline-jsonl.mjs'
import { PROVENANCE } from '#libs-shared/timeline/entry-provenance.mjs'
import { TIMELINE_SCHEMA_VERSION } from '#libs-shared/timeline-schema-version.mjs'
import get_thread from '#libs-server/threads/get-thread.mjs'
import {
  save_pi_sync_state,
  clear_pi_sync_state
} from './pi-sync-state.mjs'

const log = debug('integrations:pi:delta')

const FALL_THROUGH = (reason) => ({ fall_through: true, reason })

export const import_pi_session_delta = async ({
  session_file,
  known_thread_id,
  sync_state
}) => {
  const stat = await fs.stat(session_file)
  if (stat.size === sync_state.byte_offset) {
    return { appended: 0, no_change: true }
  }
  if (sync_state.schema_version !== TIMELINE_SCHEMA_VERSION) {
    await clear_pi_sync_state({ session_file })
    return FALL_THROUGH('schema_version_mismatch')
  }

  const { header, entries } = await parse_pi_jsonl({ file_path: session_file })
  const migrated = migrate_pi_entries({ header, entries })
  const all_branches = extract_all_pi_branches({ entries: migrated })
  if (all_branches.length === 0) {
    await clear_pi_sync_state({ session_file })
    return FALL_THROUGH('no_branches')
  }
  const active = all_branches[0]
  const session_id = compose_pi_branch_session_id({
    header_id: header.id,
    branch_index: active.branch_index
  })

  const normalized = normalize_pi_session({
    header,
    branch_entries: active.entries,
    branch_index: active.branch_index,
    total_branches: all_branches.length,
    all_branch_session_ids: all_branches.map((b) =>
      compose_pi_branch_session_id({
        header_id: header.id,
        branch_index: b.branch_index
      })
    ),
    parent_session_path: header.parentSession ?? null,
    project_path: null,
    session_id
  })

  const thread = await get_thread({ thread_id: known_thread_id })
  const thread_dir = thread.context_dir
  const timeline_path = path.join(thread_dir, 'timeline.jsonl')

  const existing = await read_timeline_jsonl_or_default({
    timeline_path,
    default_value: []
  })
  const existing_session_ids = new Set(
    existing
      .filter((e) => e.provenance === PROVENANCE.SESSION_IMPORT)
      .map((e) => e.id)
  )

  const new_ids = new Set(normalized.messages.map((m) => m.id))
  for (const id of existing_session_ids) {
    if (!new_ids.has(id)) {
      log(
        `branch_switch: existing session-import entry ${id} not in new normalize`
      )
      await clear_pi_sync_state({ session_file })
      return FALL_THROUGH('branch_switch')
    }
  }

  const new_messages = normalized.messages.filter(
    (m) => !existing_session_ids.has(m.id)
  )

  // Write order per the documented crash-safety contract:
  //   timeline append -> thread metadata -> sync-state commit.
  // If the process dies before metadata, the next tick re-dedups, finds
  // nothing new to append, and re-writes metadata + sync-state.
  let timeline_modified = false
  if (new_messages.length > 0) {
    const delta_session = {
      ...normalized,
      messages: new_messages,
      parse_mode: 'delta'
    }
    const timeline_result = await build_timeline_from_session(delta_session, {
      thread_dir,
      thread_id: known_thread_id
    })
    timeline_modified = timeline_result.timeline_modified
  }

  // Aggregate refresh from the full normalized message set.
  // bulk_import: true bypasses session-owned field ownership checks.
  await update_thread_metadata(
    thread_dir,
    { ...normalized, parse_mode: 'delta' },
    { bulk_import: true, thread_id: known_thread_id }
  )

  await save_pi_sync_state({
    session_file,
    state: {
      byte_offset: stat.size,
      leaf_id: active.leaf_entry.id,
      branch_thread_id: known_thread_id,
      schema_version: TIMELINE_SCHEMA_VERSION
    }
  })

  return { appended: new_messages.length, timeline_modified }
}
