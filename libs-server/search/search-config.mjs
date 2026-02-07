import { promises as fs } from 'fs'
import path from 'path'
import debug from 'debug'

import config from '#config'

const log = debug('search:config')

const DEFAULT_CONFIG = {
  search: {
    default_limit: 20,
    max_limit: 100,
    debounce_ms: 300,
    timeout_ms: 30000
  },
  ripgrep: {
    max_filesize: '10M',
    exclude_patterns: [
      '**/.git/**',
      '**/node_modules/**',
      '.system/**',
      '*.lock',
      '*.log',
      'package-lock.json',
      'yarn.lock'
    ],
    include_hidden: false,
    follow_symlinks: false
  },
  result_types: {
    files: {
      enabled: true,
      extensions: ['.md', '.mjs', '.js', '.json', '.yaml', '.yml']
    },
    threads: {
      enabled: true,
      search_metadata: true,
      search_timeline: true
    },
    entities: {
      enabled: true,
      types: [
        'task',
        'workflow',
        'guideline',
        'text',
        'person',
        'tag',
        'physical-item',
        'physical-location'
      ]
    },
    directories: {
      enabled: true
    }
  },
  paths: {
    exclude_directories: ['node_modules', '.git', '.system', 'import-history']
  },
  recent_files: {
    enabled: true,
    hours: 48,
    limit: 50,
    directories: ['task', 'workflow', 'guideline', 'text', 'tag'],
    exclude_directories: []
  }
}

let cached_config = null

/**
 * Load search configuration from user base directory
 *
 * @returns {Promise<Object>} Search configuration merged with defaults
 */
export async function load_search_config() {
  if (cached_config) {
    return cached_config
  }

  const user_base_dir =
    config.user_base_directory || process.env.USER_BASE_DIRECTORY

  if (!user_base_dir) {
    log('No user base directory configured, using defaults')
    cached_config = DEFAULT_CONFIG
    return cached_config
  }

  const config_path = path.join(user_base_dir, 'config', 'search-config.json')

  try {
    const config_content = await fs.readFile(config_path, 'utf-8')
    const user_config = JSON.parse(config_content)

    // Deep merge user config with defaults
    cached_config = deep_merge(DEFAULT_CONFIG, user_config)
    log(`Loaded search config from ${config_path}`)
  } catch (error) {
    if (error.code === 'ENOENT') {
      log(`No search config found at ${config_path}, using defaults`)
    } else {
      log(`Error loading search config: ${error.message}, using defaults`)
    }
    cached_config = DEFAULT_CONFIG
  }

  return cached_config
}

/**
 * Get a specific configuration section
 *
 * @param {string} section - Configuration section name
 * @returns {Promise<Object>} Configuration section or empty object
 */
export async function get_search_config_section(section) {
  const full_config = await load_search_config()
  return full_config[section] || {}
}

/**
 * Clear cached configuration (useful for testing)
 */
export function clear_config_cache() {
  cached_config = null
}

/**
 * Deep merge two objects
 *
 * @param {Object} target - Target object
 * @param {Object} source - Source object to merge
 * @returns {Object} Merged object
 */
function deep_merge(target, source) {
  const result = { ...target }

  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key])
    ) {
      result[key] = deep_merge(result[key] || {}, source[key])
    } else {
      result[key] = source[key]
    }
  }

  return result
}

export { DEFAULT_CONFIG }

export default {
  load_search_config,
  get_search_config_section,
  clear_config_cache,
  DEFAULT_CONFIG
}
