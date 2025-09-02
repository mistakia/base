/**
 * Notion Entity Cache - Shared cache system for external ID to base URI mappings
 *
 * Provides a lightweight caching layer for Notion entity lookups to improve performance
 * and support consistent child page conversion across the system.
 */

import debug from 'debug'
import fs from 'fs/promises'
import path from 'path'
import config from '#config'

const log = debug('integrations:notion:cache')

// Cache file location in user base directory
const CACHE_FILENAME = 'notion-entity-cache.tsv'

/**
 * In-memory cache object to avoid repeated file reads
 * Structure: { external_id: { base_uri: string, last_verified: string } }
 */
let memory_cache = null

/**
 * Get the absolute path to the cache file
 * @returns {string|null} Cache file path or null if user_base_directory not configured
 */
function get_cache_file_path() {
  if (!config.user_base_directory) {
    log('No user_base_directory configured, cache disabled')
    return null
  }

  return path.join(config.user_base_directory, CACHE_FILENAME)
}

/**
 * Parse TSV cache line into cache entry
 * @param {string} line - TSV line to parse
 * @returns {Object|null} Cache entry or null if invalid
 */
function parse_cache_line(line) {
  const parts = line.trim().split('\t')
  if (parts.length !== 3) {
    return null
  }

  const [external_id, base_uri, last_verified] = parts
  if (!external_id || !base_uri || !last_verified) {
    return null
  }

  return {
    external_id,
    base_uri,
    last_verified
  }
}

/**
 * Format cache entry into TSV line
 * @param {string} external_id - External ID
 * @param {string} base_uri - Base URI
 * @param {string} last_verified - ISO timestamp
 * @returns {string} TSV formatted line
 */
function format_cache_line(external_id, base_uri, last_verified) {
  return `${external_id}\t${base_uri}\t${last_verified}`
}

/**
 * Load cache from TSV file into memory
 * @returns {Promise<Object>} Cache object
 */
async function load_cache() {
  const cache_path = get_cache_file_path()
  if (!cache_path) {
    return {}
  }

  try {
    const content = await fs.readFile(cache_path, 'utf-8')
    const lines = content.split('\n')
    const cache = {}

    for (const line of lines) {
      if (line.trim() && !line.startsWith('#')) {
        // Skip empty lines and comments
        const entry = parse_cache_line(line)
        if (entry) {
          cache[entry.external_id] = {
            base_uri: entry.base_uri,
            last_verified: entry.last_verified
          }
        }
      }
    }

    log(`Loaded ${Object.keys(cache).length} entries from cache`)
    return cache
  } catch (error) {
    if (error.code === 'ENOENT') {
      log('Cache file does not exist, starting with empty cache')
      return {}
    }

    log(`Error loading cache: ${error.message}`)
    return {}
  }
}

/**
 * Save cache to TSV file
 * @param {Object} cache - Cache object to save
 * @returns {Promise<boolean>} Success status
 */
async function save_cache(cache) {
  const cache_path = get_cache_file_path()
  if (!cache_path) {
    return false
  }

  try {
    const lines = ['# external_id\tbase_uri\tlast_verified']

    for (const [external_id, entry] of Object.entries(cache)) {
      lines.push(
        format_cache_line(external_id, entry.base_uri, entry.last_verified)
      )
    }

    await fs.writeFile(cache_path, lines.join('\n') + '\n', 'utf-8')
    log(`Saved ${Object.keys(cache).length} entries to cache`)
    return true
  } catch (error) {
    log(`Error saving cache: ${error.message}`)
    return false
  }
}

/**
 * Ensure cache is loaded into memory
 * @returns {Promise<Object>} Cache object
 */
async function ensure_cache_loaded() {
  if (memory_cache === null) {
    memory_cache = await load_cache()
  }
  return memory_cache
}

/**
 * Lookup entity base URI by external ID from cache
 * @param {string} external_id - External ID to lookup
 * @returns {Promise<string|null>} Base URI if found, null otherwise
 */
export async function lookup_entity(external_id) {
  if (!external_id) {
    return null
  }

  const cache = await ensure_cache_loaded()
  const entry = cache[external_id]

  if (entry) {
    log(`Cache hit for external_id: ${external_id} -> ${entry.base_uri}`)
    return entry.base_uri
  }

  log(`Cache miss for external_id: ${external_id}`)
  return null
}

/**
 * Cache entity mapping from external ID to base URI
 * @param {string} external_id - External ID
 * @param {string} base_uri - Base URI
 * @returns {Promise<boolean>} Success status
 */
export async function cache_entity(external_id, base_uri) {
  if (!external_id || !base_uri) {
    return false
  }

  const cache = await ensure_cache_loaded()
  const timestamp = new Date().toISOString()

  cache[external_id] = {
    base_uri,
    last_verified: timestamp
  }

  log(`Cached mapping: ${external_id} -> ${base_uri}`)

  // Save to file asynchronously (don't wait for completion)
  save_cache(cache).catch((error) => {
    log(`Failed to save cache: ${error.message}`)
  })

  return true
}

/**
 * Remove stale cache entry
 * @param {string} external_id - External ID to remove
 * @returns {Promise<boolean>} Success status
 */
export async function remove_cache_entry(external_id) {
  if (!external_id) {
    return false
  }

  const cache = await ensure_cache_loaded()

  if (cache[external_id]) {
    delete cache[external_id]
    log(`Removed cache entry for external_id: ${external_id}`)

    // Save to file asynchronously
    save_cache(cache).catch((error) => {
      log(`Failed to save cache after removal: ${error.message}`)
    })

    return true
  }

  return false
}

/**
 * Get cache statistics
 * @returns {Promise<Object>} Cache statistics
 */
export async function get_cache_stats() {
  const cache = await ensure_cache_loaded()

  return {
    total_entries: Object.keys(cache).length,
    cache_file_path: get_cache_file_path(),
    memory_loaded: memory_cache !== null
  }
}

/**
 * Clear all cache data (memory and file)
 * @returns {Promise<boolean>} Success status
 */
export async function clear_cache() {
  memory_cache = {}

  const cache_path = get_cache_file_path()
  if (!cache_path) {
    return true
  }

  try {
    await fs.writeFile(
      cache_path,
      '# external_id\tbase_uri\tlast_verified\n',
      'utf-8'
    )
    log('Cache cleared')
    return true
  } catch (error) {
    log(`Error clearing cache: ${error.message}`)
    return false
  }
}
