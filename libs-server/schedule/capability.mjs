import net from 'node:net'
import dgram from 'node:dgram'
import os from 'node:os'
import fs from 'node:fs/promises'
import path from 'node:path'
import debug from 'debug'

import config from '#config'
import { get_current_machine_id } from '#libs-server/schedule/machine-identity.mjs'

const log = debug('schedule:capability')

const CACHE_TTL_MS = 60_000
const REACH_PROBE_TIMEOUT_MS = 1000
const DEFAULT_REACH_PORT = 22

const probe_cache = new Map()
const warned_unknown_prefixes = new Set()

const get_clock = () => Date.now()

const cache_get = (capability) => {
  const entry = probe_cache.get(capability)
  if (!entry) return null
  if (get_clock() - entry.at > CACHE_TTL_MS) {
    probe_cache.delete(capability)
    return null
  }
  return entry.value
}

const cache_set = (capability, value) => {
  probe_cache.set(capability, { at: get_clock(), value })
}

export const clear_capability_cache = () => {
  probe_cache.clear()
}

const probe_host = ({ target }) => {
  return get_current_machine_id() === target
}

const probe_reach = ({ target }) =>
  new Promise((resolve) => {
    const registry = config.machine_registry || {}
    const entry = registry[target]
    if (!entry || !entry.hostname) {
      log('reach:%s -- no machine_registry entry or hostname', target)
      resolve(false)
      return
    }
    const port = entry.reach_probe?.port ?? DEFAULT_REACH_PORT
    const socket = new net.Socket()
    let settled = false
    const finish = (ok) => {
      if (settled) return
      settled = true
      try {
        socket.destroy()
      } catch {
        /* noop */
      }
      resolve(ok)
    }
    socket.setTimeout(REACH_PROBE_TIMEOUT_MS)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
    try {
      socket.connect(port, entry.hostname)
    } catch {
      finish(false)
    }
  })

const get_default_route_ip = () =>
  new Promise((resolve) => {
    const socket = dgram.createSocket('udp4')
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      try {
        socket.close()
      } catch {
        /* noop */
      }
      resolve(value)
    }
    try {
      socket.connect(53, '8.8.8.8', () => {
        try {
          finish(socket.address().address)
        } catch {
          finish(null)
        }
      })
      socket.once('error', () => finish(null))
    } catch {
      finish(null)
    }
  })

const ip_to_long = (ip) => {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    return null
  }
  return (
    ((parts[0] << 24) >>> 0) +
    ((parts[1] << 16) >>> 0) +
    ((parts[2] << 8) >>> 0) +
    parts[3]
  )
}

const ip_in_cidr = ({ ip, cidr }) => {
  if (!ip || !cidr) return false
  const [base, bits_str] = cidr.split('/')
  const bits = Number(bits_str)
  if (Number.isNaN(bits) || bits < 0 || bits > 32) return false
  const base_long = ip_to_long(base)
  const ip_long = ip_to_long(ip)
  if (base_long == null || ip_long == null) return false
  if (bits === 0) return true
  const mask = (~0 << (32 - bits)) >>> 0
  return (base_long & mask) === (ip_long & mask)
}

const probe_lan = async ({ target }) => {
  const networks = config.lan_networks || {}
  const cidr = networks[target]
  if (!cidr) {
    log('lan:%s -- no lan_networks[%s] CIDR configured', target, target)
    return false
  }
  const ip = await get_default_route_ip()
  if (!ip) {
    log('lan:%s -- could not determine default route IP', target)
    return false
  }
  return ip_in_cidr({ ip, cidr })
}

const probes = {
  host: probe_host,
  reach: probe_reach,
  lan: probe_lan
}

const parse_capability = (capability) => {
  const idx = capability.indexOf(':')
  if (idx <= 0) return { prefix: null, target: null }
  const target = capability.slice(idx + 1)
  if (!target) return { prefix: null, target: null }
  return { prefix: capability.slice(0, idx), target }
}

export const has_capability = async ({ capability }) => {
  const cached = cache_get(capability)
  if (cached !== null) return cached

  const { prefix, target } = parse_capability(capability)
  const probe = prefix ? probes[prefix] : null
  if (!probe) {
    if (!warned_unknown_prefixes.has(prefix)) {
      warned_unknown_prefixes.add(prefix)
      log(
        'unknown capability prefix %s in %s -- failing closed',
        prefix,
        capability
      )
    }
    cache_set(capability, false)
    return false
  }
  let ok = false
  try {
    ok = await probe({ target })
  } catch (err) {
    log('probe %s threw: %s -- failing closed', capability, err.message)
    ok = false
  }
  cache_set(capability, Boolean(ok))
  return Boolean(ok)
}

export const meets_requirements = async ({ requires }) => {
  if (!Array.isArray(requires) || requires.length === 0) {
    return { ok: true, missing: [] }
  }
  const results = await Promise.all(
    requires.map(async (capability) => ({
      capability,
      ok: await has_capability({ capability })
    }))
  )
  const missing = results.filter((r) => !r.ok).map((r) => r.capability)
  return { ok: missing.length === 0, missing }
}

export const current_capabilities = async () => {
  const capabilities = []
  const machine_id = get_current_machine_id()
  if (machine_id) {
    capabilities.push({ capability: `host:${machine_id}`, ok: true })
  }
  const registry = config.machine_registry || {}
  for (const target of Object.keys(registry)) {
    capabilities.push({
      capability: `reach:${target}`,
      ok: await has_capability({ capability: `reach:${target}` })
    })
  }
  const networks = config.lan_networks || {}
  for (const name of Object.keys(networks)) {
    capabilities.push({
      capability: `lan:${name}`,
      ok: await has_capability({ capability: `lan:${name}` })
    })
  }
  return capabilities
}

const probe_config_dir = () =>
  path.join(os.homedir(), '.config', 'base')

const write_if_changed = async ({ file_path, content }) => {
  try {
    const existing = await fs.readFile(file_path, 'utf8')
    if (existing === content) return false
  } catch {
    /* missing file -- write below */
  }
  await fs.mkdir(path.dirname(file_path), { recursive: true })
  await fs.writeFile(file_path, content, 'utf8')
  return true
}

export const write_probe_config = async () => {
  const dir = probe_config_dir()
  const machine_id = get_current_machine_id() || ''
  const registry = config.machine_registry || {}
  const networks = config.lan_networks || {}

  const reach_lines = Object.entries(registry)
    .filter(([, entry]) => entry && entry.hostname)
    .map(([id, entry]) => {
      const port = entry.reach_probe?.port ?? DEFAULT_REACH_PORT
      return `${id} ${entry.hostname} ${port}`
    })
    .join('\n')

  const lan_lines = Object.entries(networks)
    .map(([name, cidr]) => `${name} ${cidr}`)
    .join('\n')

  const written = {
    machine_id: await write_if_changed({
      file_path: path.join(dir, 'machine-id'),
      content: machine_id ? `${machine_id}\n` : ''
    }),
    reach_targets: await write_if_changed({
      file_path: path.join(dir, 'reach-targets.conf'),
      content: reach_lines ? `${reach_lines}\n` : ''
    }),
    lan_networks: await write_if_changed({
      file_path: path.join(dir, 'lan-networks.conf'),
      content: lan_lines ? `${lan_lines}\n` : ''
    })
  }

  return {
    directory: dir,
    machine_id,
    registry_entries: Object.keys(registry).length,
    lan_entries: Object.keys(networks).length,
    written
  }
}
