// Most helpers are best-effort: errors are swallowed with debug logs so a
// transient lease-store outage never fails a hook PUT. Ownership is checked
// against the lease-client snapshot cache before every operation because
// inspect_lease and contended acquire_lease both populate the cache with
// foreign-owned records (`{acquired: false, machine_id: <other>, ...}`),
// which would otherwise cause us to skip acquisitions or extend leases we
// do not own.
//
// `acquire_session_lease_strict` is the exception: SessionStart-style routes
// must distinguish a transient lease-store outage (caller should retry) from
// a definitive contention or success (caller should proceed). It rethrows
// `LeaseStoreUnreachable` so the route layer can answer 503 + Retry-After in
// enforce mode; all other errors are still swallowed so a missing service
// token or unexpected 4xx does not crash a SessionStart.

import debug from 'debug'

import config from '#config'
import { get_current_machine_id } from '#libs-server/schedule/machine-identity.mjs'
import {
  acquire_lease,
  renew_lease,
  release_lease,
  bind_session_id,
  inspect_lease,
  get_cached_lease_snapshot,
  LeaseStoreUnreachable
} from '#libs-server/threads/lease-client.mjs'

const log = debug('threads:session-lease-coemit')

const DEFAULT_LEASE_TTL_MINUTES = 120

const _resolve_ttl_ms = () => {
  const minutes = config.thread_config?.lease_ttl_minutes
  if (typeof minutes === 'number' && minutes > 0) {
    return minutes * 60 * 1000
  }
  return DEFAULT_LEASE_TTL_MINUTES * 60 * 1000
}

const _get_owned_snapshot = ({ thread_id, machine_id }) => {
  const snap = get_cached_lease_snapshot({ thread_id })
  if (!snap) return null
  if (snap.acquired === false) return null
  if (snap.machine_id && snap.machine_id !== machine_id) return null
  if (snap.lease_token == null) return null
  return snap
}

// Internal: the shared acquire body. `strict=true` rethrows
// LeaseStoreUnreachable; otherwise all errors are swallowed.
const _acquire_session_lease = async ({ thread_id, session_id, strict }) => {
  if (!thread_id) return
  const machine_id = get_current_machine_id()
  if (!machine_id) {
    log('skip acquire %s: machine_id unresolved', thread_id)
    return
  }
  const owned = _get_owned_snapshot({ thread_id, machine_id })
  if (owned) {
    // Lease already held; bind a real session_id if the lease was acquired
    // earlier with session_id=null (e.g. job-worker acquire before SessionStart).
    if (session_id && owned.session_id == null) {
      try {
        await bind_session_id({
          thread_id,
          lease_token: owned.lease_token,
          session_id
        })
      } catch (error) {
        if (strict && error instanceof LeaseStoreUnreachable) throw error
        log('bind_session_id failed for %s: %s', thread_id, error.message)
      }
    }
    return
  }
  try {
    const result = await acquire_lease({
      thread_id,
      machine_id,
      session_id,
      ttl_ms: _resolve_ttl_ms(),
      mode: 'session'
    })
    if (result?.acquired) {
      log('acquired %s token=%s', thread_id, result.lease_token)
    } else {
      log(
        'acquire skipped: %s held by %s (token=%s)',
        thread_id,
        result?.machine_id || 'unknown',
        result?.lease_token
      )
    }
  } catch (error) {
    if (strict && error instanceof LeaseStoreUnreachable) throw error
    log('acquire failed for %s: %s', thread_id, error.message)
  }
}

export const coemit_acquire_session_lease = ({
  thread_id,
  session_id = null
}) => _acquire_session_lease({ thread_id, session_id, strict: false })

// Strict variant for SessionStart-style routes. Rethrows LeaseStoreUnreachable
// so the caller can answer 503 + Retry-After when field-ownership enforcement
// is on. All other errors are still swallowed (best-effort).
export const acquire_session_lease_strict = ({
  thread_id,
  session_id = null
}) => _acquire_session_lease({ thread_id, session_id, strict: true })

export const coemit_renew_session_lease = async ({ thread_id }) => {
  if (!thread_id) return
  const machine_id = get_current_machine_id()
  if (!machine_id) {
    log('skip renew %s: machine_id unresolved', thread_id)
    return
  }
  try {
    let lease_token = _get_owned_snapshot({
      thread_id,
      machine_id
    })?.lease_token
    let recovered = false
    if (lease_token == null) {
      const lease = await inspect_lease({ thread_id })
      if (lease && lease.machine_id === machine_id) {
        lease_token = lease.lease_token
        recovered = true
      }
    }
    if (lease_token == null) {
      // No prior owner on this machine; treat the keepalive trigger as a
      // best-effort acquire so a base-api restart mid-session can re-anchor.
      await coemit_acquire_session_lease({ thread_id })
      return
    }
    if (recovered) log('lease-recovered %s token=%s', thread_id, lease_token)
    await renew_lease({
      thread_id,
      lease_token,
      ttl_ms: _resolve_ttl_ms()
    })
    log('renewed %s token=%s', thread_id, lease_token)
  } catch (error) {
    log('renew failed for %s: %s', thread_id, error.message)
  }
}

export const coemit_release_session_lease = async ({ thread_id }) => {
  if (!thread_id) return
  const machine_id = get_current_machine_id()
  if (!machine_id) return
  const snapshot = _get_owned_snapshot({ thread_id, machine_id })
  if (!snapshot) return
  try {
    await release_lease({ thread_id, lease_token: snapshot.lease_token })
    log('released %s token=%s', thread_id, snapshot.lease_token)
  } catch (error) {
    log('release failed for %s: %s', thread_id, error.message)
  }
}
