import debug from 'debug'
import config from '#config'
import {
  inspect_lease,
  LeaseStoreUnreachable
} from '#libs-server/threads/lease-client.mjs'
import { get_current_machine_id } from '#libs-server/schedule/machine-identity.mjs'
import {
  classify_field,
  check_writable
} from '#libs-server/threads/field-ownership.mjs'

const log = debug('api:threads:lease-routing')

const LEASE_UNREACHABLE_RETRY_AFTER_SECONDS = 5

export const send_lease_unreachable = (res, error) => {
  res.set('Retry-After', String(LEASE_UNREACHABLE_RETRY_AFTER_SECONDS))
  res.status(503).json({
    error: 'lease_store_unreachable',
    reason: error.message,
    retry_after_seconds: LEASE_UNREACHABLE_RETRY_AFTER_SECONDS
  })
}

const _is_enforce_mode = () =>
  config.thread_config?.field_ownership_enforce === true

export const apply_read_lease_routing = async ({ thread_id, req, res }) => {
  let lease = null
  try {
    lease = await inspect_lease({ thread_id })
  } catch (err) {
    log('inspect_lease failed for %s: %s', thread_id, err.message)
  }

  const holder = lease?.machine_id || null
  const current = get_current_machine_id()

  if (holder) {
    res.set('X-Thread-Owner', holder)
  }

  if (!holder || holder === current) {
    res.set('X-Thread-Source', 'local')
    return { redirect: false }
  }

  res.set('X-Thread-Source', 'local-mirror')
  return { redirect: false }
}

// Precondition gate: inspect_lease is called once and the snapshot drives the
// per-field decisions. The check is NOT atomic with the subsequent write --
// the lease can change between this function returning and write_thread_metadata
// running on the caller. Callers must honor { block: true } by returning
// immediately without performing any writes; partial-success semantics are
// not defined. The TOCTOU window is intrinsic to the lease/HTTP boundary;
// strict atomicity would require gating the write at the storage tier.
export const check_write_lease_routing = async ({
  thread_id,
  patches,
  req,
  res
}) => {
  const fields = Object.keys(patches || {})
  if (fields.length === 0) return { block: false }

  let lease = null
  try {
    lease = await inspect_lease({ thread_id })
  } catch (err) {
    log('inspect_lease failed for write check %s: %s', thread_id, err.message)
    // In enforce mode, a write that we cannot validate against the lease
    // store would otherwise hard-reject as 403 (no local lease snapshot).
    // 503 + Retry-After lets the hook caller back off and retry instead.
    if (err instanceof LeaseStoreUnreachable && _is_enforce_mode()) {
      send_lease_unreachable(res, err)
      return { block: true }
    }
  }

  const current = get_current_machine_id()

  for (const field of fields) {
    const result = check_writable({
      field,
      current_machine: current,
      lease_state: lease,
      op: 'patch'
    })

    if (result.allowed) continue

    // In shadow mode, check_writable already logged and returned allowed:true.
    // This branch is only reached when field_ownership_enforce is true.
    if (!_is_enforce_mode()) continue

    const klass = classify_field(field)
    const holder = lease?.machine_id || null

    if (klass === 'session-owned') {
      log(
        'write blocked: session-owned field=%s thread=%s holder=%s',
        field,
        thread_id,
        holder
      )
      res.status(403).json({
        error: 'lease_violation',
        field,
        lease_holder: holder,
        reason: result.reason
      })
      return { block: true }
    }

    log(
      'write conflict: lifecycle/analyzer field=%s thread=%s holder=%s',
      field,
      thread_id,
      holder
    )
    res.status(409).json({
      error: 'lease_conflict',
      field,
      lease_holder: holder,
      reason: 'lease_holder_unreachable'
    })
    return { block: true }
  }

  return { block: false }
}
