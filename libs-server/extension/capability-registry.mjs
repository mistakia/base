/**
 * Capability registry -- module-level singleton.
 *
 * Extensions register provider modules for named capabilities.
 * Core code queries the registry instead of hardcoding imports.
 *
 * Ordering: registration order follows discovery order
 * (user extensions before system extensions).
 */

/** @type {Map<string, Array<{extension_name: string, module: object}>>} */
const providers = new Map()

/**
 * Register a provider for a capability.
 *
 * @param {string} capability_name - kebab-case capability identifier
 * @param {string} extension_name - name of the providing extension
 * @param {object} module - the imported provide module (named exports)
 */
export function register(capability_name, extension_name, module) {
  if (!providers.has(capability_name)) {
    providers.set(capability_name, [])
  }
  providers.get(capability_name).push({ extension_name, module })
}

/**
 * Get the first-registered provider module for a capability.
 *
 * @param {string} capability_name
 * @returns {object|null} provider module or null
 */
export function get(capability_name) {
  const entries = providers.get(capability_name)
  if (!entries || entries.length === 0) return null
  return entries[0].module
}

/**
 * Get all provider modules for a capability (fan-out).
 *
 * @param {string} capability_name
 * @returns {object[]} array of provider modules (empty if none)
 */
export function get_all(capability_name) {
  const entries = providers.get(capability_name)
  if (!entries) return []
  return entries.map((e) => e.module)
}

/**
 * Check whether any provider is registered for a capability.
 *
 * @param {string} capability_name
 * @returns {boolean}
 */
export function has(capability_name) {
  const entries = providers.get(capability_name)
  return Boolean(entries && entries.length > 0)
}

/**
 * List all registered capabilities and their provider extension names.
 *
 * @returns {Object<string, string[]>} capability_name -> [extension_names]
 */
export function list() {
  const result = {}
  for (const [capability_name, entries] of providers) {
    result[capability_name] = entries.map((e) => e.extension_name)
  }
  return result
}

/**
 * Clear all registrations. Test-only -- enables isolation for the
 * module-level singleton between test cases.
 */
export function _reset() {
  providers.clear()
}
