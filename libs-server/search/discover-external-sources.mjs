// Discovers search-source modules contributed by user-base extensions.
// Convention: each extension directory may ship a `search-source.mjs` at its
// root, exporting `{ name, timed?, search }`. At first use the orchestrator
// scans USER_BASE_DIRECTORY/extension/*/search-source.mjs, imports each
// module, and merges it into its adapter map. Keeps the base repo free of
// user-specific adapters.

import { existsSync, readdirSync } from 'fs'
import path from 'path'
import debug from 'debug'

import config from '#config'

const log = debug('search:discover-external-sources')

const SOURCE_FILENAME = 'search-source.mjs'

let cached = null

const resolve_extension_root = () => {
  const base = config.user_base_directory || process.env.USER_BASE_DIRECTORY
  if (!base) return null
  return path.join(base, 'extension')
}

const find_candidate_modules = (extension_root) => {
  if (!existsSync(extension_root)) return []
  let entries
  try {
    entries = readdirSync(extension_root, { withFileTypes: true })
  } catch {
    return []
  }
  const candidates = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const candidate = path.join(extension_root, entry.name, SOURCE_FILENAME)
    if (existsSync(candidate)) candidates.push({ extension: entry.name, module_path: candidate })
  }
  return candidates
}

export async function discover_external_search_sources() {
  if (cached) return cached
  const extension_root = resolve_extension_root()
  if (!extension_root) {
    cached = []
    return cached
  }
  const found = []
  for (const { extension, module_path } of find_candidate_modules(extension_root)) {
    try {
      const module = await import(module_path)
      const entry = module.default || module
      if (!entry?.name || typeof entry.search !== 'function') {
        log('Skipping %s: missing name or search() export', module_path)
        continue
      }
      found.push({
        name: entry.name,
        timed: Boolean(entry.timed),
        adapter: { search: entry.search },
        extension,
        module_path
      })
    } catch (error) {
      log('Failed to load %s: %s', module_path, error.message)
    }
  }
  cached = found
  return cached
}
