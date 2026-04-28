import debug from 'debug'
import config from '#config'
import { get_current_machine_id } from '#libs-server/schedule/machine-identity.mjs'
import { get_service_token } from '#libs-server/threads/lease-auth.mjs'

const log = debug('threads:lease-client')

const DEFAULT_LIST_RETRIES = 5
const LIST_RETRY_DELAY_MS = 500
const DEFAULT_REQUEST_TIMEOUT_MS = 5000
const VALID_FILTERS = new Set(['owned-by-me', 'owned-by-remote', 'all'])

export class LeaseStoreUnreachable extends Error {
  constructor(message, { cause } = {}) {
    super(message)
    this.name = 'LeaseStoreUnreachable'
    if (cause) this.cause = cause
  }
}

export class LeaseClientConfigError extends Error {
  constructor(message) {
    super(message)
    this.name = 'LeaseClientConfigError'
  }
}

const _resolve_storage_machine_id = () => {
  const registry = config.machine_registry
  if (!registry || typeof registry !== 'object') return null
  for (const [id, entry] of Object.entries(registry)) {
    if (entry?.storage?.enabled) return id
  }
  return null
}

const _resolve_storage_base_url = () => {
  const storage_id = _resolve_storage_machine_id()
  if (!storage_id) return null
  const entry = config.machine_registry?.[storage_id]
  return entry?.base_url || null
}

let _snapshot_cache = new Map()

const _set_snapshot = (thread_id, lease) => {
  if (!thread_id) return
  if (lease) _snapshot_cache.set(thread_id, lease)
  else _snapshot_cache.delete(thread_id)
}

export const get_cached_lease_snapshot = ({ thread_id }) =>
  _snapshot_cache.get(thread_id) || null

export const _clear_cache_for_tests = () => {
  _snapshot_cache = new Map()
}

const _is_on_storage = () => {
  const current = get_current_machine_id()
  const storage_id = _resolve_storage_machine_id()
  return Boolean(current && storage_id && current === storage_id)
}

let _local_store_promise = null
const _load_local_store = () => {
  if (!_local_store_promise) {
    _local_store_promise = import('#libs-server/threads/lease-store.mjs')
  }
  return _local_store_promise
}

const _sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const _http_request = async ({ method, path, body }) => {
  const base_url = _resolve_storage_base_url()
  if (!base_url) {
    throw new LeaseClientConfigError(
      'machine_registry[<storage>].base_url is not set; cannot reach lease store'
    )
  }
  const current_machine_id = get_current_machine_id()
  if (!current_machine_id) {
    throw new LeaseClientConfigError(
      'lease-client: cannot resolve current machine_id from machine_registry'
    )
  }
  const token = get_service_token({ machine_id: current_machine_id })
  const url = `${base_url.replace(/\/+$/, '')}${path}`
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(),
    DEFAULT_REQUEST_TIMEOUT_MS
  )
  try {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: body == null ? undefined : JSON.stringify(body),
      signal: controller.signal
    })
    const text = await response.text()
    let payload = null
    if (text) {
      try {
        payload = JSON.parse(text)
      } catch {
        payload = { raw: text }
      }
    }
    if (!response.ok) {
      const err = new Error(
        `lease HTTP ${method} ${path} failed: ${response.status} ${
          payload?.error || response.statusText
        }`
      )
      err.status = response.status
      err.payload = payload
      throw err
    }
    return payload
  } finally {
    clearTimeout(timer)
  }
}

export const acquire_lease = async ({
  thread_id,
  machine_id,
  session_id = null,
  ttl_ms,
  mode = 'session'
}) => {
  if (!thread_id) throw new Error('acquire_lease: thread_id required')
  if (!machine_id) throw new Error('acquire_lease: machine_id required')
  if (!ttl_ms || ttl_ms <= 0) throw new Error('acquire_lease: ttl_ms required')

  let result
  if (_is_on_storage()) {
    const store = await _load_local_store()
    result = await store.acquire_lease({
      thread_id,
      machine_id,
      session_id,
      ttl_ms,
      mode
    })
  } else {
    result = await _http_request({
      method: 'POST',
      path: `/api/threads/${encodeURIComponent(thread_id)}/lease/acquire`,
      body: { machine_id, session_id, ttl_ms, mode }
    })
  }
  if (result) _set_snapshot(thread_id, result)
  return result
}

export const renew_lease = async ({ thread_id, lease_token, ttl_ms }) => {
  if (!thread_id) throw new Error('renew_lease: thread_id required')
  if (lease_token == null) throw new Error('renew_lease: lease_token required')
  if (!ttl_ms || ttl_ms <= 0) throw new Error('renew_lease: ttl_ms required')

  let result
  if (_is_on_storage()) {
    const store = await _load_local_store()
    result = await store.renew_lease({ thread_id, lease_token, ttl_ms })
  } else {
    result = await _http_request({
      method: 'POST',
      path: `/api/threads/${encodeURIComponent(thread_id)}/lease/renew`,
      body: { lease_token, ttl_ms }
    })
  }
  // Renew returns { renewed, expires_at } -- merge expires_at into the
  // existing snapshot so callers reading via get_cached_lease_snapshot do
  // not see the pre-renew expiration window.
  if (result?.renewed && result.expires_at) {
    const existing = _snapshot_cache.get(thread_id)
    if (existing) {
      _set_snapshot(thread_id, { ...existing, expires_at: result.expires_at })
    }
  }
  return result
}

export const release_lease = async ({ thread_id, lease_token }) => {
  if (!thread_id) throw new Error('release_lease: thread_id required')
  if (lease_token == null)
    throw new Error('release_lease: lease_token required')

  if (_is_on_storage()) {
    const store = await _load_local_store()
    const result = await store.release_lease({ thread_id, lease_token })
    if (result?.released) _set_snapshot(thread_id, null)
    return result
  }
  const result = await _http_request({
    method: 'POST',
    path: `/api/threads/${encodeURIComponent(thread_id)}/lease/release`,
    body: { lease_token }
  })
  if (result?.released) _set_snapshot(thread_id, null)
  return result
}

export const inspect_lease = async ({ thread_id }) => {
  if (!thread_id) throw new Error('inspect_lease: thread_id required')
  let result
  if (_is_on_storage()) {
    const store = await _load_local_store()
    result = await store.inspect_lease({ thread_id })
  } else {
    result = await _http_request({
      method: 'GET',
      path: `/api/threads/${encodeURIComponent(thread_id)}/lease`
    })
  }
  _set_snapshot(thread_id, result)
  return result
}

export const list_active_leases = async ({ filter = 'all' } = {}) => {
  if (!VALID_FILTERS.has(filter)) {
    throw new Error(
      `list_active_leases: filter must be one of ${[...VALID_FILTERS].join(', ')}`
    )
  }

  if (_is_on_storage()) {
    const store = await _load_local_store()
    if (filter === 'all') return store.list_active_leases()
    const me = get_current_machine_id()
    if (!me) {
      throw new LeaseClientConfigError(
        'lease-client: cannot resolve current machine_id for filtered list'
      )
    }
    if (filter === 'owned-by-me') {
      return store.list_active_leases({ machine_id: me })
    }
    const all = await store.list_active_leases()
    return all.filter((lease) => lease.machine_id !== me)
  }

  let last_error = null
  for (let attempt = 0; attempt < DEFAULT_LIST_RETRIES; attempt += 1) {
    try {
      const payload = await _http_request({
        method: 'GET',
        path: `/api/threads/lease?filter=${encodeURIComponent(filter)}`
      })
      return Array.isArray(payload?.leases) ? payload.leases : []
    } catch (error) {
      last_error = error
      log(
        'list_active_leases attempt %d/%d failed: %s',
        attempt + 1,
        DEFAULT_LIST_RETRIES,
        error.message
      )
      if (attempt < DEFAULT_LIST_RETRIES - 1) {
        await _sleep(LIST_RETRY_DELAY_MS * (attempt + 1))
      }
    }
  }
  throw new LeaseStoreUnreachable(
    `lease store unreachable after ${DEFAULT_LIST_RETRIES} attempts: ${
      last_error?.message || 'unknown error'
    }`,
    { cause: last_error }
  )
}
