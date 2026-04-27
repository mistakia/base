// Builds the audit_context object that write_thread_metadata expects.
// Resolves the current machine_id and reads the cached lease snapshot for
// the thread; both are pure lookups so the helper stays synchronous.

import { get_current_machine_id } from '#libs-server/schedule/machine-identity.mjs'
import { get_cached_lease_snapshot } from '#libs-server/threads/lease-client.mjs'

export const build_thread_audit_context = ({
  thread_id,
  op,
  session_id = null,
  actor = null
}) => {
  const lease_snapshot = get_cached_lease_snapshot({ thread_id })
  return {
    thread_id,
    machine_id: get_current_machine_id(),
    session_id,
    actor,
    op,
    lease_state: lease_snapshot
      ? { machine_id: lease_snapshot.machine_id, mode: lease_snapshot.mode }
      : null,
    lease_token: lease_snapshot?.lease_token ?? null
  }
}
