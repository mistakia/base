/**
 * Nonce Cache Module
 *
 * Prevents authentication request replay attacks by tracking used nonces.
 * Uses an in-memory Map with TTL-based cleanup and size limits.
 */

import debug from 'debug'

const log = debug('auth:nonce-cache')

// Default TTL of 5 minutes (in milliseconds)
const DEFAULT_TTL_MS = 5 * 60 * 1000

// Cleanup interval of 60 seconds
const CLEANUP_INTERVAL_MS = 60 * 1000

// Maximum cache size to prevent unbounded memory growth
const MAX_CACHE_SIZE = 10000

// Store nonces with their expiration timestamps
const nonce_cache = new Map()

let cleanup_interval = null

/**
 * Check if a nonce has been used
 * @param {Object} params - Parameters
 * @param {string} params.nonce - The nonce to check
 * @returns {boolean} True if nonce has been used (replay attempt)
 */
export function is_nonce_used({ nonce }) {
  if (!nonce) {
    return false
  }

  const entry = nonce_cache.get(nonce)
  if (!entry) {
    return false
  }

  // Check if entry has expired
  if (Date.now() > entry.expires_at) {
    nonce_cache.delete(nonce)
    return false
  }

  return true
}

/**
 * Evict oldest entries if cache exceeds size limit
 * Uses insertion order (Map maintains order) as LRU approximation
 */
function evict_if_needed() {
  if (nonce_cache.size <= MAX_CACHE_SIZE) {
    return
  }

  const to_evict = nonce_cache.size - MAX_CACHE_SIZE
  let evicted = 0
  for (const key of nonce_cache.keys()) {
    if (evicted >= to_evict) break
    nonce_cache.delete(key)
    evicted++
  }

  if (evicted > 0) {
    log(`Evicted ${evicted} oldest nonces due to size limit`)
  }
}

/**
 * Mark a nonce as used
 * @param {Object} params - Parameters
 * @param {string} params.nonce - The nonce to mark as used
 * @param {number} [params.ttl_ms] - Time-to-live in milliseconds (default: 5 minutes)
 */
export function mark_nonce_used({ nonce, ttl_ms = DEFAULT_TTL_MS }) {
  if (!nonce) {
    return
  }

  const expires_at = Date.now() + ttl_ms
  nonce_cache.set(nonce, { expires_at })
  log(
    `Nonce marked as used: ${nonce.substring(0, 8)}... (expires in ${ttl_ms}ms)`
  )

  // Evict oldest entries if cache is too large
  evict_if_needed()

  // Start cleanup interval if not already running
  start_cleanup_interval()
}

/**
 * Clean up expired nonces from the cache
 */
function cleanup_expired_nonces() {
  const now = Date.now()
  let cleaned = 0

  for (const [nonce, entry] of nonce_cache.entries()) {
    if (now > entry.expires_at) {
      nonce_cache.delete(nonce)
      cleaned++
    }
  }

  if (cleaned > 0) {
    log(`Cleaned up ${cleaned} expired nonces, ${nonce_cache.size} remaining`)
  }

  // Stop cleanup interval if cache is empty
  if (nonce_cache.size === 0 && cleanup_interval) {
    clearInterval(cleanup_interval)
    cleanup_interval = null
    log('Cleanup interval stopped (cache empty)')
  }
}

/**
 * Start the cleanup interval if not already running
 */
function start_cleanup_interval() {
  if (cleanup_interval) {
    return
  }

  cleanup_interval = setInterval(cleanup_expired_nonces, CLEANUP_INTERVAL_MS)
  log('Cleanup interval started')
}

/**
 * Stop the cleanup interval and clear the cache
 * Used for testing and graceful shutdown
 */
export function clear_nonce_cache() {
  if (cleanup_interval) {
    clearInterval(cleanup_interval)
    cleanup_interval = null
  }
  nonce_cache.clear()
  log('Nonce cache cleared')
}

/**
 * Get the current size of the nonce cache
 * Used for testing and monitoring
 * @returns {number} Number of nonces in the cache
 */
export function get_nonce_cache_size() {
  return nonce_cache.size
}
