import debug from 'debug'

import { search_all_file_paths } from './ripgrep-file-search.mjs'

const log = debug('search:file-path-cache')

let cached_paths = null
let valid = false
let fetch_promise = null
let generation = 0

/**
 * Invalidate the file path cache.
 * Called when files are added or deleted (e.g., from chokidar watcher events).
 */
export function invalidate() {
  if (valid) {
    log('File path cache invalidated')
  }
  valid = false
  cached_paths = null
  fetch_promise = null
  generation++
}

/**
 * Get all file paths, using cache when available.
 * Falls back to a fresh ripgrep enumeration if cache is invalid.
 * Uses promise deduplication to prevent concurrent fetches from racing.
 *
 * @param {Object} [options] - Options passed to search_all_file_paths
 * @param {string} [options.directory] - Optional directory scope
 * @param {number} [options.max_results=20000] - Maximum results
 * @returns {Promise<Array<Object>>} Array of file path objects
 */
export async function get_file_paths(options = {}) {
  // Only use cache for unscoped (full) searches
  if (options.directory) {
    return search_all_file_paths(options)
  }

  if (valid && cached_paths) {
    log('Returning cached file paths (%d entries)', cached_paths.length)
    return cached_paths
  }

  // Deduplicate concurrent fetches - return existing promise if one is in-flight
  if (fetch_promise) {
    log('Returning in-flight fetch promise')
    return fetch_promise
  }

  log('Cache miss, fetching file paths...')
  const fetch_generation = generation
  fetch_promise = search_all_file_paths(options)

  try {
    const result = await fetch_promise
    // Only cache if not invalidated during fetch
    if (generation === fetch_generation) {
      cached_paths = result
      valid = true
      log('Cached %d file paths', result.length)
    }
    return result
  } finally {
    fetch_promise = null
  }
}
