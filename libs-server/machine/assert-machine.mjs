import os from 'os'
import config from '#config'

export class WrongMachineError extends Error {
  constructor(actual, expected, role) {
    super(
      `assert_on_machine(${role}): hostname mismatch (actual=${actual}, expected=${expected || '<unresolved>'})`
    )
    this.name = 'WrongMachineError'
    this.actual = actual
    this.expected = expected
    this.role = role
  }
}

const _resolve_hostname = (role) => {
  const registry = config.machine_registry
  if (!registry || typeof registry !== 'object') return null
  if (role === 'storage') {
    for (const entry of Object.values(registry)) {
      if (entry?.storage?.enabled) return entry.hostname || null
    }
    return null
  }
  return registry[role]?.hostname || null
}

const _checked = new Set()

export const assert_on_machine = (role) => {
  if (_checked.has(role)) return
  if (process.env.NODE_ENV === 'test') {
    _checked.add(role)
    return
  }
  const expected = _resolve_hostname(role)
  const actual = os.hostname()
  if (!expected || actual !== expected) {
    throw new WrongMachineError(actual, expected, role)
  }
  _checked.add(role)
}

export const _reset_for_tests = () => _checked.clear()
