import { promises as fs } from 'fs'
import path from 'path'
import debug from 'debug'

import { get_user_base_directory } from '#libs-server/base-uri/base-directory-registry.mjs'

const log = debug('entity:scan-config')

const DEFAULT_CONFIG = {
  exclude_path_patterns: [],
  submodule_exclusion_prefixes: []
}

let cached_config = null

/**
 * Load entity scan configuration from user base directory.
 * Merges user overlay from config/entity-scan-config.json over defaults.
 *
 * @returns {Promise<Object>} Entity scan configuration merged with defaults
 */
export async function load_entity_scan_config() {
  if (cached_config) {
    return cached_config
  }

  let user_base_dir
  try {
    user_base_dir = get_user_base_directory()
  } catch {
    log('No user base directory configured, using defaults')
    cached_config = DEFAULT_CONFIG
    return cached_config
  }

  const config_path = path.join(
    user_base_dir,
    'config',
    'entity-scan-config.json'
  )

  try {
    const config_content = await fs.readFile(config_path, 'utf-8')
    const user_config = JSON.parse(config_content)

    // Arrays are replaced, not concatenated
    cached_config = { ...DEFAULT_CONFIG, ...user_config }
    log(`Loaded entity scan config from ${config_path}`)
  } catch (error) {
    if (error.code === 'ENOENT') {
      log(`No entity scan config found at ${config_path}, using defaults`)
    } else {
      log(`Error loading entity scan config: ${error.message}, using defaults`)
    }
    cached_config = DEFAULT_CONFIG
  }

  return cached_config
}

/**
 * Clear cached configuration (useful for testing or config reload)
 */
export function clear_entity_scan_config_cache() {
  cached_config = null
}

export { DEFAULT_CONFIG }
