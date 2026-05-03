import qs from 'qs'

import config from '#config'

const API_BASE = 'https://api.cloudflare.com/client/v4'
const ZONE_ID_PATTERN = /^[a-f0-9]{32}$/

const zone_cache = new Map()

export class MultipleRecordsError extends Error {
  constructor(message, records) {
    super(message)
    this.name = 'MultipleRecordsError'
    this.records = records
  }
}

const auth_headers = () => ({
  Authorization: `Bearer ${config.cloudflare.token}`,
  'Content-Type': 'application/json'
})

const default_zone = () => config.cloudflare.default_zone_id

export const resolve_zone = async ({ zone } = {}) => {
  const target = zone ?? default_zone()
  if (!target) {
    throw new Error(
      'no zone specified and config.cloudflare.default_zone_id / zone_id is unset'
    )
  }

  if (zone_cache.has(target)) {
    return zone_cache.get(target)
  }

  if (ZONE_ID_PATTERN.test(target)) {
    const url = `${API_BASE}/zones/${target}`
    const res = await fetch(url, { method: 'GET', headers: auth_headers() })
    const json = await res.json()
    if (!json.success) {
      throw new Error(`failed to resolve zone id ${target}: ${JSON.stringify(json.errors)}`)
    }
    const resolved = { id: json.result.id, name: json.result.name }
    zone_cache.set(target, resolved)
    zone_cache.set(resolved.name, resolved)
    return resolved
  }

  const url = `${API_BASE}/zones?${qs.stringify({ name: target })}`
  const res = await fetch(url, { method: 'GET', headers: auth_headers() })
  const json = await res.json()
  if (!json.success) {
    throw new Error(`failed to resolve zone ${target}: ${JSON.stringify(json.errors)}`)
  }
  if (!json.result || json.result.length === 0) {
    throw new Error(`zone not found: ${target}`)
  }
  const z = json.result[0]
  const resolved = { id: z.id, name: z.name }
  zone_cache.set(target, resolved)
  zone_cache.set(resolved.id, resolved)
  return resolved
}

export const list_zones = async () => {
  const url = `${API_BASE}/zones?${qs.stringify({ per_page: 50 })}`
  const res = await fetch(url, { method: 'GET', headers: auth_headers() })
  return res.json()
}

export const get_records = async ({ zone, name, type, per_page = 300 } = {}) => {
  const { id: zone_id } = await resolve_zone({ zone })
  const query = qs.stringify(
    { name, type, per_page },
    { skipNulls: true }
  )
  let url = `${API_BASE}/zones/${zone_id}/dns_records`
  if (query) url = `${url}?${query}`

  const res = await fetch(url, { method: 'GET', headers: auth_headers() })
  return res.json()
}

export const create_record = async ({
  zone,
  type,
  name,
  content,
  ttl = 1,
  proxied = false
}) => {
  const { id: zone_id } = await resolve_zone({ zone })
  const url = `${API_BASE}/zones/${zone_id}/dns_records`
  const res = await fetch(url, {
    method: 'POST',
    headers: auth_headers(),
    body: JSON.stringify({ type, name, content, ttl, proxied })
  })
  return res.json()
}

export const update_record = async ({
  zone,
  id,
  type,
  name,
  content,
  ttl = 1,
  proxied = false
}) => {
  const { id: zone_id } = await resolve_zone({ zone })
  const url = `${API_BASE}/zones/${zone_id}/dns_records/${id}`
  const res = await fetch(url, {
    method: 'PUT',
    headers: auth_headers(),
    body: JSON.stringify({ type, name, content, ttl, proxied })
  })
  return res.json()
}

export const delete_record = async ({ zone, id }) => {
  const { id: zone_id } = await resolve_zone({ zone })
  const url = `${API_BASE}/zones/${zone_id}/dns_records/${id}`
  const res = await fetch(url, { method: 'DELETE', headers: auth_headers() })
  return res.json()
}

export const upsert_record = async ({
  zone,
  type,
  name,
  content,
  ttl = 1,
  proxied = false,
  dry_run = false
}) => {
  const resolved = await resolve_zone({ zone })
  const lookup = await get_records({ zone: resolved.id, name, type })
  if (!lookup.success) {
    throw new Error(`failed to query records: ${JSON.stringify(lookup.errors)}`)
  }
  const matches = lookup.result || []

  if (matches.length > 1) {
    throw new MultipleRecordsError(
      `multiple ${type} records match ${name} in zone ${resolved.name}; caller must disambiguate by id`,
      matches
    )
  }

  if (matches.length === 0) {
    const planned = { type, name, content, ttl, proxied }
    if (dry_run) {
      return { action: 'created', record: planned, before: null, zone: resolved }
    }
    const created = await create_record({
      zone: resolved.id,
      type,
      name,
      content,
      ttl,
      proxied
    })
    if (!created.success) {
      throw new Error(`failed to create record: ${JSON.stringify(created.errors)}`)
    }
    return { action: 'created', record: created.result, before: null, zone: resolved }
  }

  const existing = matches[0]
  const same =
    existing.content === content &&
    existing.ttl === ttl &&
    Boolean(existing.proxied) === Boolean(proxied)

  if (same) {
    return { action: 'unchanged', record: existing, before: existing, zone: resolved }
  }

  if (dry_run) {
    return {
      action: 'updated',
      record: { ...existing, content, ttl, proxied },
      before: existing,
      zone: resolved
    }
  }

  const updated = await update_record({
    zone: resolved.id,
    id: existing.id,
    type,
    name,
    content,
    ttl,
    proxied
  })
  if (!updated.success) {
    throw new Error(`failed to update record: ${JSON.stringify(updated.errors)}`)
  }
  return { action: 'updated', record: updated.result, before: existing, zone: resolved }
}
