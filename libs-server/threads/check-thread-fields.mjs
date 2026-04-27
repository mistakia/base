// Iterate a set of metadata field names and run check_writable for each.
// Returns one {field, allowed, reason} per input field. In shadow mode the
// `allowed` flag is always true and the `reason` carries a `shadow:` prefix
// for the would-block path; the field-ownership module emits violation
// telemetry from inside check_writable. In enforce mode (Phase 3) the
// caller branches on `allowed === false` to translate into 409/403.

import { check_writable } from '#libs-server/threads/field-ownership.mjs'
import { build_thread_audit_context } from '#libs-server/threads/build-thread-audit-context.mjs'

export const check_thread_fields_writable = ({
  thread_id,
  fields,
  op = 'patch',
  caller_flag = {}
}) => {
  const ctx = build_thread_audit_context({ thread_id, op })
  return [...fields].map((field) => ({
    field,
    ...check_writable({
      field,
      current_machine: ctx.machine_id,
      lease_state: ctx.lease_state,
      op,
      caller_flag
    })
  }))
}
