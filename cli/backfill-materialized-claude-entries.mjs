#!/usr/bin/env bun
// One-shot backfill: re-derive previously-dropped claude raw event types
// (queue-operation, file-history-snapshot, permission-mode, attachment,
// last-prompt, custom-title, agent-name) for each thread that has a
// raw-data/claude-session.jsonl. Calls the actual normalize_claude_session
// so the resulting deterministic uuid5 ids match what new imports will
// produce. Surgical: only adds the materialized entries that aren't already
// in timeline.jsonl. Existing entries are untouched. Temp-file + rename.

import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'

import { normalize_claude_session } from '#libs-server/integrations/claude/normalize-session.mjs'
import { sort_timeline_entries } from '#libs-server/threads/timeline/index.mjs'
import { acquire_thread_import_lock } from '#libs-server/threads/timeline/thread-import-lock.mjs'
import {
  PROVENANCE,
  assert_valid_provenance
} from '#libs-shared/timeline/entry-provenance.mjs'

const MATERIALIZED_RAW_TYPES = new Set([
  'queue-operation',
  'file-history-snapshot',
  'permission-mode',
  'attachment',
  'last-prompt',
  'custom-title',
  'agent-name'
])

const THREAD_DIR = process.argv[2]
if (!THREAD_DIR) {
  console.error('usage: backfill-materialized-claude-entries.mjs <thread_dir>')
  process.exit(2)
}

const parse_raw_session_file = async (file_path) => {
  const stream = fs.createReadStream(file_path)
  const reader = readline.createInterface({
    input: stream,
    crlfDelay: Infinity
  })
  let line_count = 0
  const all_entries = []
  const file_summaries = []
  for await (const line of reader) {
    line_count++
    if (line.trim() === '') continue
    let entry
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    if (entry.type === 'summary') {
      file_summaries.push(entry.summary)
      continue
    }
    entry.line_number = entry.line_number || line_count
    entry.parse_line_number = line_count
    all_entries.push(entry)
  }
  all_entries.sort(
    (a, b) => (a.parse_line_number || 0) - (b.parse_line_number || 0)
  )
  return { entries: all_entries, file_summaries }
}

const read_timeline = (timeline_path) => {
  if (!fs.existsSync(timeline_path)) return { entries: [], ids: new Set() }
  const raw = fs.readFileSync(timeline_path, 'utf8')
  const body = raw.endsWith('\n') ? raw.slice(0, -1) : raw
  const entries = []
  const ids = new Set()
  for (const line of body.split('\n')) {
    if (!line.trim()) continue
    try {
      const e = JSON.parse(line)
      entries.push(e)
      if (e && e.id) ids.add(e.id)
    } catch {}
  }
  return { entries, ids }
}

const write_timeline_atomic = (timeline_path, entries) => {
  sort_timeline_entries(entries)
  // Enforce the provenance invariant at the last write boundary so this
  // script — which bypasses the shared append_timeline_entries write path
  // for atomic-replace semantics — cannot silently persist unstamped
  // entries. Atomic-replace is required here: session-derived timelines
  // must be re-sorted after merge, which fs.appendFile cannot produce.
  for (const entry of entries) assert_valid_provenance(entry)
  const body = entries.map((e) => JSON.stringify(e)).join('\n')
  const tmp = timeline_path + '.tmp'
  fs.writeFileSync(tmp, body + '\n')
  fs.renameSync(tmp, timeline_path)
}

const thread_dirs = fs
  .readdirSync(THREAD_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)

let scanned = 0
let claude_threads = 0
let modified_threads = 0
let total_added = 0
const failures = []

for (const tid of thread_dirs) {
  const thread_path = path.join(THREAD_DIR, tid)
  const metadata_path = path.join(thread_path, 'metadata.json')
  const raw_session_path = path.join(
    thread_path,
    'raw-data',
    'claude-session.jsonl'
  )
  const timeline_path = path.join(thread_path, 'timeline.jsonl')
  if (!fs.existsSync(metadata_path)) continue
  scanned++
  let metadata
  try {
    metadata = JSON.parse(fs.readFileSync(metadata_path, 'utf8'))
  } catch {
    continue
  }
  const source = metadata.source || {}
  if (source.provider !== 'claude') continue
  if (!source.session_id) continue
  if (!fs.existsSync(raw_session_path)) continue
  claude_threads++

  let normalized
  try {
    const { entries, file_summaries } =
      await parse_raw_session_file(raw_session_path)
    // Pre-filter: if no materialized raw types are present, skip the heavy
    // normalize step entirely.
    const has_target = entries.some((e) => MATERIALIZED_RAW_TYPES.has(e.type))
    if (!has_target) continue
    normalized = normalize_claude_session({
      session_id: source.session_id,
      entries,
      metadata: { file_path: raw_session_path, file_summaries }
    })
  } catch (err) {
    failures.push({ tid, error: err.message })
    continue
  }

  // Acquire per-thread import lock so this read-modify-write cannot race
  // with the scheduled importer. Non-zero exit on timeout for this thread;
  // id-keyed idempotence makes partial re-runs safe.
  let lock
  try {
    lock = await acquire_thread_import_lock({ thread_dir: thread_path })
  } catch (err) {
    failures.push({ tid, error: `lock acquire failed: ${err.message}` })
    continue
  }

  try {
    // Existing timeline content (preserved unchanged). Pre-condition: the
    // Phase B migration (scripts/migrate-timeline-provenance.mjs) has run,
    // so every legacy entry already carries `provenance`. The write-time
    // assert inside write_timeline_atomic enforces this explicitly.
    const { entries: existing_entries, ids: existing_ids } =
      read_timeline(timeline_path)

    // Pick materialized entries not yet present, drop the others.
    const new_entries = []
    for (const m of normalized.messages || []) {
      if (!m || !m.id) continue
      if (existing_ids.has(m.id)) continue
      // Restrict to entries that came from the materialized raw types so we
      // don't touch user/assistant/system/summary entries that the existing
      // pipeline already handled (deduping by id is already a guard, but this
      // is belt-and-braces).
      const orig = m.metadata && m.metadata.original_type
      if (!orig || !MATERIALIZED_RAW_TYPES.has(orig)) continue
      new_entries.push({
        ...m,
        timestamp:
          m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
        provider: 'claude',
        schema_version: 2,
        provenance: PROVENANCE.SESSION_IMPORT
      })
    }

    if (new_entries.length === 0) continue

    const merged = existing_entries.concat(new_entries)
    write_timeline_atomic(timeline_path, merged)
    modified_threads++
    total_added += new_entries.length
  } finally {
    await lock.release().catch(() => {})
  }
  if (modified_threads % 25 === 0) {
    console.log(
      `progress: scanned=${scanned} claude=${claude_threads} modified=${modified_threads} added=${total_added}`
    )
  }
}

console.log(
  `\nsummary: scanned=${scanned} claude_threads=${claude_threads} modified=${modified_threads} entries_added=${total_added} failures=${failures.length}`
)
if (failures.length) {
  console.log('first 5 failures:')
  for (const f of failures.slice(0, 5)) console.log(' ', f.tid, f.error)
  process.exit(1)
}
