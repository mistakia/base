import debug from 'debug'

import { list_file_paths } from '#libs-server/files/list-file-paths.mjs'

const log = debug('search:file-path-cache')

// Cache keyed by resolved absolute path; null key = whole user-base.
const cache_by_path = new Map()
const inflight_by_path = new Map()
let generation = 0

/**
 * Invalidate all cached file path enumerations.
 */
export function invalidate() {
  if (cache_by_path.size > 0) {
    log('File path cache invalidated (%d entries)', cache_by_path.size)
  }
  cache_by_path.clear()
  inflight_by_path.clear()
  generation++
}

/**
 * Get file paths for a resolved absolute directory path (or the whole
 * user-base when `resolved_directory_path` is null). Result cached per key.
 *
 * @param {Object} [options]
 * @param {string|null} [options.resolved_directory_path]
 * @param {number} [options.max_results=20000]
 */
export async function get_file_paths(options = {}) {
  const { resolved_directory_path = null, max_results } = options
  const key = resolved_directory_path || ''

  const cached = cache_by_path.get(key)
  if (cached) {
    log('Returning cached file paths for %s (%d entries)', key || '<root>', cached.length)
    return cached
  }

  const inflight = inflight_by_path.get(key)
  if (inflight) {
    log('Returning in-flight fetch promise for %s', key || '<root>')
    return inflight
  }

  log('Cache miss, fetching file paths for %s', key || '<root>')
  const fetch_generation = generation
  const promise = list_file_paths({
    resolved_directory_path,
    ...(max_results ? { max_results } : {})
  })
  inflight_by_path.set(key, promise)

  try {
    const result = await promise
    if (generation === fetch_generation) {
      cache_by_path.set(key, result)
      log('Cached %d file paths for %s', result.length, key || '<root>')
    }
    return result
  } finally {
    inflight_by_path.delete(key)
  }
}
