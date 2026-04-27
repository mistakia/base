import debug from 'debug'
import config from '#config'
import { inspect_lease } from '#libs-server/threads/lease-client.mjs'
import { get_current_machine_id } from '#libs-server/schedule/machine-identity.mjs'
import { classify_field } from '#libs-server/threads/field-ownership.mjs'
import { check_writable } from '#libs-server/threads/field-ownership.mjs'

const log = debug('api:threads:lease-routing')

const _base_url_for = (machine_id) =>
  config.machine_registry?.[machine_id]?.base_url || null

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

  const base_url = _base_url_for(holder)
  if (base_url) {
    const location = `${base_url.replace(/\/+$/, '')}${req.originalUrl}`
    log('read redirect %s → %s', thread_id, location)
    res.redirect(307, location)
    return { redirect: true }
  }

  res.set('X-Thread-Source', 'local-mirror')
  return { redirect: false }
}

export const check_write_lease_routing = async ({ thread_id, patches, req, res }) => {
  const fields = Object.keys(patches || {})
  if (fields.length === 0) return { block: false }

  let lease = null
  try {
    lease = await inspect_lease({ thread_id })
  } catch (err) {
    log('inspect_lease failed for write check %s: %s', thread_id, err.message)
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
        field, thread_id, holder
      )
      res.status(403).json({
        error: 'lease_violation',
        field,
        lease_holder: holder,
        reason: result.reason
      })
      return { block: true }
    }

    const base_url = holder ? _base_url_for(holder) : null
    if (base_url) {
      const location = `${base_url.replace(/\/+$/, '')}${req.originalUrl}`
      log('write redirect %s field=%s → %s', thread_id, field, location)
      res.redirect(307, location)
      return { block: true }
    }

    log(
      'write conflict: lifecycle/analyzer field=%s thread=%s holder=%s no base_url',
      field, thread_id, holder
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
