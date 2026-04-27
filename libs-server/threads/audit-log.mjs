// Per-thread append-only JSONL writer for thread metadata mutations.
//
// PM2 INVARIANT: this module assumes base-api runs `exec_mode: 'fork',
// instances: 1`. The in-process `Map<thread_id, Promise>` queue serializes
// appends only within one process; cluster mode would interleave writes
// across workers. No runtime assertion is added because module-load throws
// crash compiled-Bun binaries that transitively import; cluster mode is not
// on the roadmap.

import { join } from 'path'
import { promises as fs } from 'fs'
import debug from 'debug'

const log = debug('threads:audit-log')

const AUDIT_FILE = 'audit.jsonl'

const _per_thread_queue = new Map()

const _enqueue = (thread_id, fn) => {
  const prior = _per_thread_queue.get(thread_id) || Promise.resolve()
  const next = prior.then(
    () => fn(),
    () => fn()
  )
  const stored = next.catch(() => {}).finally(() => {
    if (_per_thread_queue.get(thread_id) === stored) {
      _per_thread_queue.delete(thread_id)
    }
  })
  _per_thread_queue.set(thread_id, stored)
  return next
}

export const compute_field_diff = ({ before, after }) => {
  const diff = {}
  const keys = new Set([
    ...Object.keys(before || {}),
    ...Object.keys(after || {})
  ])
  for (const key of keys) {
    const b = before?.[key]
    const a = after?.[key]
    if (_deep_equal(b, a)) continue
    diff[key] = { before: b ?? null, after: a ?? null }
  }
  return diff
}

const _deep_equal = (a, b) => {
  if (a === b) return true
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  if (typeof a !== typeof b) return false
  if (typeof a !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const a_keys = Object.keys(a)
  const b_keys = Object.keys(b)
  if (a_keys.length !== b_keys.length) return false
  return a_keys.every((k) => _deep_equal(a[k], b[k]))
}

export const append_audit_entry = async ({
  thread_dir,
  thread_id,
  ts = new Date().toISOString(),
  machine_id,
  session_id = null,
  actor = null,
  op,
  fields_changed = {},
  lease_holder = null,
  lease_mode = null,
  lease_token = null
}) => {
  if (!thread_dir) throw new Error('append_audit_entry: thread_dir required')
  if (!thread_id) throw new Error('append_audit_entry: thread_id required')
  if (!op) throw new Error('append_audit_entry: op required')

  const entry = {
    ts,
    machine_id,
    session_id,
    actor,
    op,
    fields_changed,
    lease_holder,
    lease_mode,
    lease_token
  }
  const line = `${JSON.stringify(entry)}\n`
  const path = join(thread_dir, AUDIT_FILE)

  return _enqueue(thread_id, async () => {
    try {
      await fs.appendFile(path, line, 'utf8')
    } catch (error) {
      log('append failed for %s: %s', thread_id, error.message)
      throw error
    }
  })
}

export const _drain_for_tests = async () => {
  const pending = [..._per_thread_queue.values()]
  _per_thread_queue.clear()
  await Promise.allSettled(pending)
}
