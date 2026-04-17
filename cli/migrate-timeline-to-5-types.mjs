#!/usr/bin/env bun

/**
 * Migrate timeline.jsonl files from 12-type to 5-type schema.
 *
 * Transformations:
 *   state_change        -> system (system_type="state_change")
 *   thread_state_change -> system (system_type="state_change", metadata.thread_lifecycle=true)
 *   error               -> system (system_type="error")
 *   thread_main_request -> message (role="user")
 *   notification        -> system (system_type="status")
 *   human_request       -> message (role="user")
 *   assistant_response  -> message (role="assistant")
 *
 * Pass-through: message, tool_call, tool_result, thinking, system.
 *
 * Usage:
 *   bun cli/migrate-timeline-to-5-types.mjs                  # Migrate all threads
 *   bun cli/migrate-timeline-to-5-types.mjs --dry-run        # Report changes without writing
 *   bun cli/migrate-timeline-to-5-types.mjs --thread-id <id> # Migrate a single thread
 *   bun cli/migrate-timeline-to-5-types.mjs --verify         # Post-migration verification pass
 */

import fs from 'fs/promises'
import fs_sync from 'fs'
import path from 'path'
import os from 'os'
import readline from 'readline'
import { createReadStream, createWriteStream } from 'fs'

import { TIMELINE_SCHEMA_VERSION } from '#libs-shared/timeline-schema-version.mjs'

const USER_BASE_DIR = process.env.USER_BASE_DIRECTORY || ''
const THREAD_DIR = USER_BASE_DIR ? path.join(USER_BASE_DIR, 'thread') : ''
const PROGRESS_FILE = THREAD_DIR
  ? path.join(THREAD_DIR, '.migrate-progress.json')
  : ''
const BACKUP_DIR = THREAD_DIR ? path.join(THREAD_DIR, '.migrate-backup') : ''

const MAX_ERROR_MESSAGE_BYTES = 5 * 1024
const TARGET_TYPES = new Set([
  'message',
  'tool_call',
  'tool_result',
  'thinking',
  'system'
])

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const VERIFY_ONLY = args.includes('--verify')
const thread_id_flag_index = args.indexOf('--thread-id')
const SINGLE_THREAD_ID =
  thread_id_flag_index >= 0 ? args[thread_id_flag_index + 1] : null

const truncate_message = (text) => {
  if (typeof text !== 'string') return text
  if (Buffer.byteLength(text, 'utf8') <= MAX_ERROR_MESSAGE_BYTES) return text
  const buf = Buffer.from(text, 'utf8').subarray(0, MAX_ERROR_MESSAGE_BYTES)
  return buf.toString('utf8') + ' [truncated]'
}

// Stamp the current schema version on a transformed entry and rename the
// legacy `session_provider` field to the schema-declared `provider` name.
// Spreads at the end so the migration's version wins over any caller field.
const stamp = (entry) => {
  const { session_provider, ...rest } = entry
  return {
    ...rest,
    ...(session_provider !== undefined && rest.provider === undefined
      ? { provider: session_provider }
      : {}),
    schema_version: TIMELINE_SCHEMA_VERSION
  }
}

/**
 * Transform a single timeline entry. Returns the (possibly new) entry and a
 * boolean indicating whether the entry was changed.
 *
 * Idempotency is gated on schema_version: any entry already at or above
 * TIMELINE_SCHEMA_VERSION passes through unchanged regardless of its type.
 */
export const transform_entry = (entry) => {
  if (!entry || typeof entry !== 'object' || !entry.type) {
    return { entry, changed: false }
  }

  if ((entry.schema_version ?? 1) >= TIMELINE_SCHEMA_VERSION) {
    return { entry, changed: false }
  }

  switch (entry.type) {
    case 'state_change': {
      const from_state =
        entry.content?.from_state || entry.previous_state || 'unknown'
      const to_state = entry.content?.to_state || entry.new_state || 'unknown'
      const reason = entry.content?.reason || entry.reason
      const content = reason
        ? `${from_state} -> ${to_state}: ${reason}`
        : `${from_state} -> ${to_state}`
      const {
        type: _t,
        content: _c,
        previous_state: _ps,
        new_state: _ns,
        reason: _r,
        metadata: prior_metadata = {},
        ...rest
      } = entry
      return {
        entry: stamp({
          ...rest,
          type: 'system',
          system_type: 'state_change',
          content,
          metadata: {
            ...prior_metadata,
            from_state,
            to_state,
            ...(reason ? { reason } : {})
          }
        }),
        changed: true
      }
    }

    case 'thread_state_change': {
      const from_state = entry.previous_thread_state || 'unknown'
      const to_state = entry.new_thread_state || 'unknown'
      const reason = entry.reason
      const content = reason
        ? `${from_state} -> ${to_state}: ${reason}`
        : `${from_state} -> ${to_state}`
      const {
        type: _t,
        previous_thread_state: _p,
        new_thread_state: _n,
        reason: _r,
        metadata: prior_metadata = {},
        ...rest
      } = entry
      return {
        entry: stamp({
          ...rest,
          type: 'system',
          system_type: 'state_change',
          content,
          metadata: {
            ...prior_metadata,
            from_state,
            to_state,
            thread_lifecycle: true,
            ...(reason ? { reason } : {})
          }
        }),
        changed: true
      }
    }

    case 'error': {
      const error_type = entry.error_type || 'unknown'
      const raw_message = entry.message || entry.content || ''
      const message = truncate_message(
        typeof raw_message === 'string'
          ? raw_message
          : JSON.stringify(raw_message)
      )
      const {
        type: _t,
        error_type: _et,
        message: _m,
        details,
        content: _c,
        metadata: prior_metadata = {},
        ...rest
      } = entry
      return {
        entry: stamp({
          ...rest,
          type: 'system',
          system_type: 'error',
          content: `[${error_type}] ${message}`,
          metadata: {
            ...prior_metadata,
            error_type,
            message,
            ...(details ? { details } : {})
          }
        }),
        changed: true
      }
    }

    case 'thread_main_request': {
      const { type: _t, ...rest } = entry
      return {
        entry: stamp({
          ...rest,
          type: 'message',
          role: 'user'
        }),
        changed: true
      }
    }

    case 'notification': {
      const {
        type: _t,
        severity,
        content: raw_content,
        metadata: prior_metadata = {},
        ...rest
      } = entry
      // System entries require string content; legacy notifications sometimes
      // stored { message } or other object shapes.
      const content =
        typeof raw_content === 'string'
          ? raw_content
          : raw_content == null
            ? ''
            : raw_content.message || JSON.stringify(raw_content)
      return {
        entry: stamp({
          ...rest,
          type: 'system',
          system_type: 'status',
          content,
          metadata: {
            ...prior_metadata,
            ...(severity ? { severity } : {})
          }
        }),
        changed: true
      }
    }

    case 'human_request': {
      const {
        type: _t,
        prompt,
        response,
        request_id,
        request_type,
        status,
        metadata: prior_metadata = {},
        ...rest
      } = entry
      return {
        entry: stamp({
          ...rest,
          type: 'message',
          role: 'user',
          content: prompt || entry.content || '',
          metadata: {
            ...prior_metadata,
            human_request: true,
            ...(request_id ? { request_id } : {}),
            ...(request_type ? { request_type } : {}),
            ...(status ? { status } : {}),
            ...(response ? { response } : {})
          }
        }),
        changed: true
      }
    }

    case 'assistant_response': {
      const { type: _t, metadata: prior_metadata, ...rest } = entry
      return {
        entry: stamp({
          ...rest,
          type: 'message',
          role: 'assistant',
          ...(prior_metadata ? { metadata: prior_metadata } : {})
        }),
        changed: true
      }
    }

    default:
      // Pre-versioning entry whose type is already a 5-type primitive: stamp
      // it so the file becomes uniformly at the target version in one pass.
      // Unknown legacy types are left untouched so verify_thread can flag
      // them; stamping would hide them from re-runs via the progress gate.
      if (TARGET_TYPES.has(entry.type)) {
        return { entry: stamp(entry), changed: true }
      }
      return { entry, changed: false }
  }
}

const load_progress = async () => {
  try {
    const raw = await fs.readFile(PROGRESS_FILE, 'utf8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

const save_progress = async (progress) => {
  if (DRY_RUN) return
  const tmp = `${PROGRESS_FILE}.tmp`
  await fs.writeFile(tmp, JSON.stringify(progress, null, 2))
  await fs.rename(tmp, PROGRESS_FILE)
}

const save_progress_sync = (progress) => {
  if (DRY_RUN) return
  const tmp = `${PROGRESS_FILE}.tmp`
  fs_sync.writeFileSync(tmp, JSON.stringify(progress, null, 2))
  fs_sync.renameSync(tmp, PROGRESS_FILE)
}

const list_thread_ids = async () => {
  if (SINGLE_THREAD_ID) return [SINGLE_THREAD_ID]
  const entries = await fs.readdir(THREAD_DIR, { withFileTypes: true })
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name)
}

const migrate_thread = async (thread_id) => {
  const timeline_path = path.join(THREAD_DIR, thread_id, 'timeline.jsonl')
  try {
    await fs.access(timeline_path)
  } catch {
    return { thread_id, status: 'skipped', entries_total: 0, entries_changed: 0 }
  }

  const counts_by_type = {}
  const unknown_types = {}
  let entries_total = 0
  let entries_changed = 0

  const tmp_path = `${timeline_path}.migrate.tmp`
  // A stale tmp from a crashed prior run is always safe to discard: the rename
  // to timeline_path is the commit point, so any tmp left behind represents an
  // incomplete write. Remove it and log so operators notice recurring crashes.
  if (!DRY_RUN) {
    try {
      await fs.unlink(tmp_path)
      console.warn(
        `[migrate] ${thread_id}: removed stale tmp from prior run: ${tmp_path}`
      )
    } catch (err) {
      if (err.code !== 'ENOENT') throw err
    }
  }

  const rl = readline.createInterface({
    input: createReadStream(timeline_path, { encoding: 'utf8' }),
    crlfDelay: Infinity
  })

  const out_stream = DRY_RUN ? null : createWriteStream(tmp_path)

  for await (const line of rl) {
    if (!line.trim()) continue
    entries_total++
    let entry
    try {
      entry = JSON.parse(line)
    } catch (err) {
      console.error(
        `[migrate] ${thread_id}: failed to parse line ${entries_total}: ${err.message}`
      )
      if (!DRY_RUN) out_stream.write(line + '\n')
      continue
    }

    const { entry: new_entry, changed } = transform_entry(entry)
    if (changed) {
      entries_changed++
      counts_by_type[entry.type] = (counts_by_type[entry.type] || 0) + 1
    } else if (
      entry.type &&
      !TARGET_TYPES.has(entry.type) &&
      (entry.schema_version ?? 1) < TIMELINE_SCHEMA_VERSION
    ) {
      unknown_types[entry.type] = (unknown_types[entry.type] || 0) + 1
    }

    if (!DRY_RUN) {
      out_stream.write(JSON.stringify(new_entry) + '\n')
    }
  }

  if (!DRY_RUN) {
    await new Promise((resolve, reject) => {
      out_stream.end((err) => (err ? reject(err) : resolve()))
    })

    if (entries_changed > 0) {
      // Backup original (exclusive — never clobber an existing backup) then
      // replace atomically via rename on the same filesystem.
      const backup_path = path.join(BACKUP_DIR, thread_id, 'timeline.jsonl')
      await fs.mkdir(path.dirname(backup_path), { recursive: true })
      try {
        await fs.copyFile(
          timeline_path,
          backup_path,
          fs_sync.constants.COPYFILE_EXCL
        )
      } catch (err) {
        if (err.code !== 'EEXIST') throw err
        // Backup already present from a prior run — preserve original backup.
      }
      await fs.rename(tmp_path, timeline_path)
    } else {
      // No changes — discard tmp
      await fs.unlink(tmp_path).catch(() => {})
    }
  }

  const has_unknown = Object.keys(unknown_types).length > 0
  if (has_unknown) {
    console.error(
      `[migrate] ${thread_id}: unrecognized legacy types require manual review: ${JSON.stringify(unknown_types)}`
    )
  }

  return {
    thread_id,
    status: has_unknown ? 'needs_review' : 'done',
    entries_total,
    entries_changed,
    counts_by_type,
    ...(has_unknown ? { unknown_types } : {})
  }
}

const verify_thread = async (thread_id) => {
  const timeline_path = path.join(THREAD_DIR, thread_id, 'timeline.jsonl')
  try {
    await fs.access(timeline_path)
  } catch {
    return { thread_id, ok: true, bad_types: {}, entries: 0 }
  }
  const rl = readline.createInterface({
    input: createReadStream(timeline_path, { encoding: 'utf8' }),
    crlfDelay: Infinity
  })
  const bad_types = {}
  let entries = 0
  for await (const line of rl) {
    if (!line.trim()) continue
    entries++
    try {
      const entry = JSON.parse(line)
      if (!TARGET_TYPES.has(entry.type)) {
        bad_types[entry.type] = (bad_types[entry.type] || 0) + 1
      } else if ((entry.schema_version ?? 1) < TIMELINE_SCHEMA_VERSION) {
        const key = `unversioned:${entry.type}`
        bad_types[key] = (bad_types[key] || 0) + 1
      }
    } catch {
      bad_types['__parse_error__'] = (bad_types['__parse_error__'] || 0) + 1
    }
  }
  return {
    thread_id,
    ok: Object.keys(bad_types).length === 0,
    bad_types,
    entries
  }
}

const run_workers = async (thread_ids, worker_fn) => {
  const N = Math.min(os.cpus().length, 8)
  const queue = thread_ids.slice()
  const results = []
  const workers = Array.from({ length: N }, async () => {
    while (queue.length > 0) {
      const id = queue.shift()
      if (!id) break
      try {
        results.push(await worker_fn(id))
      } catch (err) {
        console.error(`[worker] ${id}: ${err.message}`)
        results.push({ thread_id: id, status: 'failed', error: err.message })
      }
      if (results.length % 500 === 0) {
        const total_changed = results.reduce(
          (s, r) => s + (r.entries_changed || 0),
          0
        )
        console.log(
          `[migrate] processed ${results.length}/${thread_ids.length} threads, ${total_changed} entries changed`
        )
      }
    }
  })
  await Promise.all(workers)
  return results
}

const main = async () => {
  if (!USER_BASE_DIR) {
    console.error('Error: USER_BASE_DIRECTORY environment variable is not set.')
    process.exit(1)
  }
  const thread_ids = await list_thread_ids()
  console.log(
    `[migrate] ${VERIFY_ONLY ? 'verifying' : 'migrating'} ${thread_ids.length} threads (dry-run=${DRY_RUN})`
  )

  if (VERIFY_ONLY) {
    const results = await run_workers(thread_ids, verify_thread)
    const bad = results.filter((r) => !r.ok)
    const total_bad_types = {}
    for (const r of bad) {
      for (const [t, c] of Object.entries(r.bad_types)) {
        total_bad_types[t] = (total_bad_types[t] || 0) + c
      }
    }
    console.log(
      `[verify] ${results.length} threads checked, ${bad.length} with non-5-type entries`
    )
    if (bad.length > 0) {
      console.log('[verify] bad type counts:', total_bad_types)
      process.exit(1)
    }
    return
  }

  const progress = await load_progress()
  const pending = thread_ids.filter(
    (id) => !progress[id] || progress[id].status !== 'done'
  )
  console.log(
    `[migrate] ${pending.length} pending (${thread_ids.length - pending.length} already done)`
  )

  let completed_since_flush = 0
  const PROGRESS_FLUSH_INTERVAL = 100

  const flush_on_signal = (signal) => {
    console.error(`[migrate] received ${signal}, flushing progress`)
    try {
      save_progress_sync(progress)
    } catch (err) {
      console.error(`[migrate] failed to flush progress: ${err.message}`)
    }
    process.exit(130)
  }
  process.on('SIGINT', () => flush_on_signal('SIGINT'))
  process.on('SIGTERM', () => flush_on_signal('SIGTERM'))

  const results = await run_workers(pending, async (id) => {
    const result = await migrate_thread(id)
    progress[id] = {
      status: result.status,
      entries_total: result.entries_total,
      entries_changed: result.entries_changed
    }
    completed_since_flush++
    if (completed_since_flush >= PROGRESS_FLUSH_INTERVAL) {
      completed_since_flush = 0
      await save_progress(progress)
    }
    return result
  })

  await save_progress(progress)

  const total_changed = results.reduce(
    (s, r) => s + (r.entries_changed || 0),
    0
  )
  const total_entries = results.reduce(
    (s, r) => s + (r.entries_total || 0),
    0
  )
  const aggregate_counts = {}
  for (const r of results) {
    for (const [t, c] of Object.entries(r.counts_by_type || {})) {
      aggregate_counts[t] = (aggregate_counts[t] || 0) + c
    }
  }

  console.log(
    `[migrate] done: ${results.length} threads, ${total_entries} entries, ${total_changed} changed`
  )
  console.log('[migrate] per-type changes:', aggregate_counts)
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
