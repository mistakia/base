#!/usr/bin/env bun
// One-shot migration: stamp explicit `provenance` on every existing
// timeline.jsonl entry, routed through the single contract module at
// libs-shared/timeline/entry-provenance.mjs. Throwaway: deleted at the end
// of Phase C.
//
// Modes:
//   (default)      stamp `provenance` on every entry that is missing or
//                  invalid, preserving `metadata.thread_lifecycle` in place
//                  so the Phase A rebuild filter remains valid.
//   --verify       re-read every entry and assert every one carries a valid
//                  `provenance`. Exits zero iff the whole corpus is stamped.
//                  In Phase C the same mode also asserts absence of
//                  `metadata.thread_lifecycle`.
//   --strip-legacy (Phase C) remove `metadata.thread_lifecycle` from every
//                  entry. Must only run after the Phase C code that stops
//                  stamping/reading the sentinel has landed.
//
// Concurrency: acquires per-thread `thread-import-lock` before any
// read-modify-write. Atomic-replace via writeFile + rename; no appendFile.
// Idempotent: entries already carrying valid provenance are skipped.

import fs from 'node:fs'
import path from 'node:path'

import {
  assert_valid_provenance,
  classify_legacy_entry,
  is_valid_provenance
} from '#libs-shared/timeline/entry-provenance.mjs'
import { acquire_thread_import_lock } from '#libs-server/threads/timeline/thread-import-lock.mjs'
import { get_thread_base_directory } from '#libs-server/threads/threads-constants.mjs'

const USAGE = `usage: migrate-timeline-provenance.mjs [--verify] [--strip-legacy] [threads-root]

Modes (mutually compatible with --verify):
  (default)       stamp provenance on every entry that is missing or invalid
  --verify        read every entry and assert valid provenance; exit non-zero if any fail
  --strip-legacy  remove metadata.thread_lifecycle from every entry (Phase C only)

Runs against all thread directories under threads-root (defaults to the
configured user-base threads directory). Acquires thread-import-lock per
thread and writes atomically (writeFile + rename). Idempotent.`

const KNOWN_FLAGS = new Set(['--verify', '--strip-legacy', '--help', '-h'])
const argv = process.argv.slice(2)

if (argv.includes('--help') || argv.includes('-h')) {
  console.log(USAGE)
  process.exit(0)
}

const unknown_flag = argv.find((a) => a.startsWith('--') && !KNOWN_FLAGS.has(a))
if (unknown_flag) {
  console.error(`unknown flag: ${unknown_flag}\n\n${USAGE}`)
  process.exit(2)
}

const VERIFY = argv.includes('--verify')
const STRIP_LEGACY = argv.includes('--strip-legacy')

const positional = argv.filter((a) => !a.startsWith('--'))
if (positional.length > 1) {
  console.error(`too many positional arguments\n\n${USAGE}`)
  process.exit(2)
}
const threads_root =
  positional[0] || get_thread_base_directory({ user_base_directory: undefined })

if (!threads_root || !fs.existsSync(threads_root)) {
  console.error(
    `migrate-timeline-provenance: threads root not found: ${threads_root}`
  )
  process.exit(2)
}

const read_jsonl = (timeline_path) => {
  const raw = fs.readFileSync(timeline_path, 'utf8')
  const body = raw.endsWith('\n') ? raw.slice(0, -1) : raw
  if (body === '') return []
  const entries = []
  let lineno = 0
  for (const line of body.split('\n')) {
    lineno++
    if (line.trim() === '') continue
    try {
      entries.push(JSON.parse(line))
    } catch (err) {
      throw new Error(
        `malformed JSON at ${timeline_path}:${lineno}: ${err.message}`
      )
    }
  }
  return entries
}

const write_jsonl_atomic = (timeline_path, entries) => {
  const body = entries.map((e) => JSON.stringify(e)).join('\n')
  const tmp = `${timeline_path}.migrate.tmp`
  fs.writeFileSync(tmp, entries.length === 0 ? '' : body + '\n')
  fs.renameSync(tmp, timeline_path)
}

const process_thread_stamp = (timeline_path) => {
  const entries = read_jsonl(timeline_path)
  let changed = false
  for (const entry of entries) {
    if (is_valid_provenance(entry.provenance)) continue
    entry.provenance = classify_legacy_entry(entry)
    changed = true
  }
  if (changed) write_jsonl_atomic(timeline_path, entries)
  return { changed, entry_count: entries.length }
}

const process_thread_strip = (timeline_path) => {
  const entries = read_jsonl(timeline_path)
  let changed = false
  for (const entry of entries) {
    if (entry?.metadata && 'thread_lifecycle' in entry.metadata) {
      delete entry.metadata.thread_lifecycle
      changed = true
    }
  }
  if (changed) write_jsonl_atomic(timeline_path, entries)
  return { changed, entry_count: entries.length }
}

const process_thread_verify = (timeline_path) => {
  const entries = read_jsonl(timeline_path)
  for (const entry of entries) {
    assert_valid_provenance(entry)
    if (
      STRIP_LEGACY &&
      entry?.metadata &&
      'thread_lifecycle' in entry.metadata
    ) {
      throw new Error(
        `verify: entry ${entry.id} still carries metadata.thread_lifecycle`
      )
    }
  }
  return { entry_count: entries.length }
}

const thread_dirs = fs
  .readdirSync(threads_root, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)

let scanned = 0
let modified = 0
let total_entries = 0
const failures = []

const mode_label = VERIFY
  ? STRIP_LEGACY
    ? 'verify+strip'
    : 'verify'
  : STRIP_LEGACY
    ? 'strip-legacy'
    : 'stamp'

for (const tid of thread_dirs) {
  const thread_dir = path.join(threads_root, tid)
  const timeline_path = path.join(thread_dir, 'timeline.jsonl')
  if (!fs.existsSync(timeline_path)) continue
  scanned++

  let lock
  try {
    lock = await acquire_thread_import_lock({ thread_dir })
  } catch (err) {
    failures.push({ tid, error: `lock acquire failed: ${err.message}` })
    continue
  }

  try {
    if (VERIFY) {
      const { entry_count } = process_thread_verify(timeline_path)
      total_entries += entry_count
      continue
    }

    const result = STRIP_LEGACY
      ? process_thread_strip(timeline_path)
      : process_thread_stamp(timeline_path)
    total_entries += result.entry_count
    if (result.changed) modified++
    if (modified > 0 && modified % 100 === 0) {
      console.log(
        `progress: mode=${mode_label} scanned=${scanned} modified=${modified}`
      )
    }
  } catch (err) {
    failures.push({ tid, error: err.message })
  } finally {
    await lock.release().catch(() => {})
  }
}

console.log(
  `\nmode=${mode_label} scanned=${scanned} modified=${modified} entries=${total_entries} failures=${failures.length}`
)
if (failures.length) {
  console.log('first 10 failures:')
  for (const f of failures.slice(0, 10)) console.log(' ', f.tid, f.error)
  process.exit(1)
}
process.exit(0)
