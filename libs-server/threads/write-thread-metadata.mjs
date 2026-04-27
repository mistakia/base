// JSON-aware shim around `read_modify_write` for thread metadata writes.
//
// This wrapper carries thread-specific knowledge -- path matching, audit
// emission, lease-token stamping -- that does not belong in the generic
// filesystem helper. The underlying `read_modify_write` in
// libs-server/filesystem/optimistic-write.mjs is unchanged: it stays
// string-in / string-out, and this module composes over it.
//
// Contract: `modify(object) => object`. The wrapper parses the file,
// invokes modify, stamps `_lease_token` for paths matching
// `thread/<id>/metadata.json` (writer's machine_id is recorded only on the
// audit entry, not on the metadata file), serializes with the existing
// 2-space indent, delegates to read_modify_write for the optimistic loop,
// then on success appends one audit entry capturing the field diff.

import { dirname, basename, sep } from 'path'
import debug from 'debug'

import { read_modify_write } from '#libs-server/filesystem/optimistic-write.mjs'
import {
  append_audit_entry,
  compute_field_diff
} from '#libs-server/threads/audit-log.mjs'

const log = debug('threads:write-thread-metadata')

const _is_thread_metadata_path = (absolute_path) => {
  if (!absolute_path) return false
  if (basename(absolute_path) !== 'metadata.json') return false
  const parts = absolute_path.split(sep)
  // Expect ".../thread/<id>/metadata.json"
  return parts.length >= 3 && parts[parts.length - 3] === 'thread'
}

export const write_thread_metadata = async ({
  absolute_path,
  modify,
  audit_context
}) => {
  if (!absolute_path) {
    throw new Error('write_thread_metadata: absolute_path required')
  }
  if (typeof modify !== 'function') {
    throw new Error('write_thread_metadata: modify must be a function')
  }

  const is_metadata = _is_thread_metadata_path(absolute_path)
  let captured_before = null
  let captured_after = null

  await read_modify_write({
    absolute_path,
    modify: async (content) => {
      const before = JSON.parse(content)
      captured_before = before
      const after = await modify(before)
      if (is_metadata && audit_context?.lease_token != null) {
        after._lease_token = audit_context.lease_token
      }
      captured_after = after
      return JSON.stringify(after, null, 2)
    }
  })

  if (!is_metadata || !audit_context) return captured_after

  const fields_changed = compute_field_diff({
    before: captured_before,
    after: captured_after
  })
  if (Object.keys(fields_changed).length === 0) return captured_after

  try {
    await append_audit_entry({
      thread_dir: dirname(absolute_path),
      thread_id: audit_context.thread_id,
      machine_id: audit_context.machine_id,
      session_id: audit_context.session_id,
      actor: audit_context.actor,
      op: audit_context.op || 'patch',
      fields_changed,
      lease_holder: audit_context.lease_state?.machine_id || null,
      lease_mode: audit_context.lease_state?.mode || null,
      lease_token: audit_context.lease_token
    })
  } catch (error) {
    log('audit emit failed for %s: %s', audit_context.thread_id, error.message)
  }

  return captured_after
}

export default write_thread_metadata
