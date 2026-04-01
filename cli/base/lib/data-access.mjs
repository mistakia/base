/**
 * Data access abstraction layer for CLI commands.
 *
 * Provides a unified interface for entity operations, encapsulating
 * backend selection (HTTP API vs filesystem+SQLite) in one place.
 * Backend is detected once at startup and cached for the process.
 */

import { authenticated_fetch } from './auth.mjs'
import { SERVER_URL, is_api_unavailable } from './format.mjs'

/** @type {'api' | 'filesystem' | null} */
let detected_backend = null

/**
 * Detect which backend to use. Checks the API server once with a
 * lightweight health probe. Falls back to filesystem on failure.
 * Result is cached for the process lifetime.
 *
 * @returns {Promise<'api' | 'filesystem'>}
 */
export async function detect_backend() {
  if (detected_backend) return detected_backend

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 2000)
    const response = await fetch(`${SERVER_URL}/api/health`, {
      signal: controller.signal
    })
    clearTimeout(timeout)
    detected_backend = response.ok ? 'api' : 'filesystem'
  } catch {
    detected_backend = 'filesystem'
  }

  return detected_backend
}

/**
 * Force the backend to a specific value. Useful when running in
 * degraded mode (no USER_BASE_DIRECTORY) or for testing.
 *
 * @param {'api' | 'filesystem'} backend
 */
export function set_backend(backend) {
  detected_backend = backend
}

/**
 * Call the API backend. If the call fails with a connection error,
 * auto-downgrade to filesystem for remaining calls in this process
 * and execute the fallback.
 *
 * @template T
 * @param {() => Promise<T>} api_fn - Function that calls the HTTP API
 * @param {() => Promise<T>} fallback_fn - Function using direct filesystem access
 * @returns {Promise<T>}
 */
async function call_with_downgrade(api_fn, fallback_fn) {
  try {
    return await api_fn()
  } catch (error) {
    if (is_api_unavailable(error)) {
      detected_backend = 'filesystem'
      return await fallback_fn()
    }
    throw error
  }
}

/**
 * Execute a data operation using the detected backend.
 * If backend is 'api', tries API first with auto-downgrade on failure.
 * If backend is 'filesystem', calls fallback directly.
 *
 * @template T
 * @param {() => Promise<T>} api_fn - Function that calls the HTTP API
 * @param {() => Promise<T>} fallback_fn - Function using direct access
 * @returns {Promise<T>}
 */
export async function query(api_fn, fallback_fn) {
  const backend = await detect_backend()
  if (backend === 'filesystem') {
    return await fallback_fn()
  }
  return call_with_downgrade(api_fn, fallback_fn)
}

// ─── Convenience API helpers ─────────────────────────────────────

/**
 * Make an authenticated GET request to the API, returning parsed JSON.
 *
 * @param {string} path - API path (e.g., '/api/entities')
 * @param {URLSearchParams|Record<string,string>} [params] - Query parameters
 * @returns {Promise<any>}
 */
export async function api_get(path, params) {
  const url_params = params instanceof URLSearchParams ? params : new URLSearchParams(params || {})
  const qs = url_params.toString()
  const url = `${SERVER_URL}${path}${qs ? `?${qs}` : ''}`
  const response = await authenticated_fetch(url)
  if (!response.ok) throw new Error(`API returned ${response.status}`)
  return response.json()
}

/**
 * Make an authenticated request with a JSON body, returning parsed JSON.
 *
 * @param {string} path - API path
 * @param {string} method - HTTP method (PATCH, POST, etc.)
 * @param {any} body - JSON body
 * @returns {Promise<any>}
 */
export async function api_mutate(path, method, body) {
  const response = await authenticated_fetch(`${SERVER_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.error || `API returned ${response.status}`)
  }
  return response.json()
}
