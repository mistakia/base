import os from 'os'
import debug from 'debug'
import config from '#config'

const log = debug('schedule:machine')

/**
 * Resolve the current machine's identifier from the machine registry in config.
 *
 * Matching strategy:
 * 1. Exact hostname match against registry entries
 * 2. Platform fallback if no hostname matches
 *
 * Recognized per-machine fields used elsewhere in the system:
 * - hostname, platform        machine identity (matched here)
 * - container_runtime         per-machine override of the global
 *                             config.container_runtime (precedence:
 *                             machine_registry[id].container_runtime ->
 *                             config.container_runtime -> 'docker').
 *                             See libs-server/container/runtime-config.mjs.
 * - claude_paths              Claude integration paths
 *
 * @param {Object} [options] - Optional overrides (used in tests)
 * @param {Object} [options.registry] - Machine registry to use instead of config
 * @param {string} [options.hostname] - Hostname override
 * @param {string} [options.platform] - Platform override
 * @returns {string|null} Machine identifier (registry key) or null if unknown
 */
export const get_current_machine_id = ({
  registry: registry_override,
  hostname: hostname_override,
  platform: platform_override
} = {}) => {
  const registry = registry_override || config.machine_registry
  if (!registry || typeof registry !== 'object') {
    log('No machine_registry configured')
    return null
  }

  const hostname = hostname_override || os.hostname()
  const platform = platform_override || os.platform()

  // Try exact hostname match first
  for (const [machine_id, entry] of Object.entries(registry)) {
    if (entry.hostname === hostname) {
      log('Matched machine %s by hostname %s', machine_id, hostname)
      return machine_id
    }
  }

  // Fallback to platform match (only when unambiguous)
  const platform_matches = Object.entries(registry).filter(
    ([, entry]) => entry.platform === platform
  )
  if (platform_matches.length === 1) {
    const [machine_id] = platform_matches[0]
    log(
      'Matched machine %s by platform %s (hostname %s unmatched)',
      machine_id,
      platform,
      hostname
    )
    return machine_id
  }
  if (platform_matches.length > 1) {
    log(
      'Ambiguous platform match for %s: %d machines share platform %s',
      hostname,
      platform_matches.length,
      platform
    )
  }

  log('No matching machine for hostname=%s platform=%s', hostname, platform)
  return null
}
