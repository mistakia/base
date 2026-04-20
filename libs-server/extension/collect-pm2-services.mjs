import debug_module from 'debug'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const debug = debug_module('pm2:collect')

function resolve_machine_id({ user_base_directory }) {
  try {
    const config_path = path.join(user_base_directory, 'config', 'config.json')
    const config_json = JSON.parse(readFileSync(config_path, 'utf8'))
    const registry = config_json.machine_registry || {}
    const hostname = os.hostname()
    return (
      Object.keys(registry).find((id) => registry[id].hostname === hostname) ||
      null
    )
  } catch (err) {
    debug('machine_id resolution failed: %s', err.message)
    return null
  }
}

function applies_to_machine({ descriptor, machine_id }) {
  if (!Array.isArray(descriptor.machines)) return true
  if (machine_id == null) {
    debug(
      'descriptor %s has machines=%o but machine_id could not be resolved; excluding',
      descriptor.name,
      descriptor.machines
    )
    return false
  }
  return descriptor.machines.includes(machine_id)
}

function strip_machines({ descriptor }) {
  const { machines: _unused, ...rest } = descriptor
  return rest
}

function resolve_script_path({ descriptor, user_base_directory }) {
  if (!descriptor.script || path.isAbsolute(descriptor.script)) return descriptor
  return {
    ...descriptor,
    script: path.join(user_base_directory, descriptor.script)
  }
}

export function collect_extension_pm2_services({ user_base_directory }) {
  const extension_dir = path.join(user_base_directory, 'extension')
  if (!existsSync(extension_dir)) return []

  const machine_id = resolve_machine_id({ user_base_directory })

  let entries
  try {
    entries = readdirSync(extension_dir, { withFileTypes: true })
  } catch (err) {
    debug('readdir %s failed: %s', extension_dir, err.message)
    return []
  }

  const descriptors = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const json_file = path.join(extension_dir, entry.name, 'provide', 'pm2-service.json')
    if (!existsSync(json_file)) continue

    let descriptor = null
    try {
      descriptor = JSON.parse(readFileSync(json_file, 'utf8'))
    } catch (err) {
      debug('load failed for %s: %s', entry.name, err.message)
      continue
    }

    if (!applies_to_machine({ descriptor, machine_id })) continue

    const stripped = strip_machines({ descriptor })
    descriptors.push(resolve_script_path({
      descriptor: stripped,
      user_base_directory
    }))
  }

  return descriptors
}
