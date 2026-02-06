import debug from 'debug'

const log = debug('utils:lru-cache')

/**
 * Evict the least recently used entry from a Map-based cache.
 * Cache entries must have an `accessed_at` timestamp property.
 *
 * @param {Map} cache_map - The Map to evict from
 * @param {Function} [logger] - Optional logger function for eviction messages
 * @returns {string|null} The key that was evicted, or null if cache was empty
 */
export function evict_lru_entry(cache_map, logger = log) {
  if (cache_map.size === 0) {
    return null
  }

  let lru_key = null
  let lru_time = Infinity

  for (const [key, entry] of cache_map) {
    if (entry.accessed_at < lru_time) {
      lru_time = entry.accessed_at
      lru_key = key
    }
  }

  if (lru_key) {
    cache_map.delete(lru_key)
    logger(`Evicted LRU cache entry: ${lru_key}`)
  }

  return lru_key
}

/**
 * Create an LRU cache with automatic eviction.
 *
 * @param {Object} options - Cache options
 * @param {number} options.max_size - Maximum number of entries
 * @param {Function} [options.logger] - Optional logger function
 * @returns {Object} Cache object with get, set, delete, has, clear, and size methods
 */
export function create_lru_cache({ max_size, logger = log } = {}) {
  const cache_map = new Map()

  return {
    /**
     * Get an entry from the cache, updating its access time
     * @param {string} key - Cache key
     * @returns {*} The cached value or undefined
     */
    get(key) {
      const entry = cache_map.get(key)
      if (entry) {
        entry.accessed_at = Date.now()
        return entry.value
      }
      return undefined
    },

    /**
     * Set an entry in the cache, evicting LRU entry if at capacity
     * @param {string} key - Cache key
     * @param {*} value - Value to cache
     */
    set(key, value) {
      // Evict before adding if at capacity (not after, to respect max_size)
      if (cache_map.size >= max_size && !cache_map.has(key)) {
        evict_lru_entry(cache_map, logger)
      }

      cache_map.set(key, {
        value,
        accessed_at: Date.now()
      })
    },

    /**
     * Delete an entry from the cache
     * @param {string} key - Cache key
     * @returns {boolean} True if entry was deleted
     */
    delete(key) {
      return cache_map.delete(key)
    },

    /**
     * Check if a key exists in the cache
     * @param {string} key - Cache key
     * @returns {boolean} True if key exists
     */
    has(key) {
      return cache_map.has(key)
    },

    /**
     * Clear all entries from the cache
     */
    clear() {
      cache_map.clear()
    },

    /**
     * Get the current size of the cache
     * @returns {number} Number of entries
     */
    get size() {
      return cache_map.size
    },

    /**
     * Get the underlying Map (for iteration or direct access)
     * @returns {Map} The cache Map
     */
    get map() {
      return cache_map
    }
  }
}
