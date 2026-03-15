/**
 * JWT authentication for CLI HTTP API calls
 *
 * Generates a JWT token locally using config.jwt.secret and
 * config.user_public_key, matching the server's token format.
 * Falls back to plain fetch() if config values are unavailable.
 */

import jwt from 'jsonwebtoken'

/**
 * Wrapper around fetch() that adds JWT Authorization header.
 * For HTTPS URLs, uses a permissive TLS agent for localhost connections.
 * Falls back to plain fetch() if config values are unavailable.
 *
 * @param {string|URL} url - Request URL
 * @param {RequestInit} [options={}] - Fetch options
 * @returns {Promise<Response>}
 */
export async function authenticated_fetch(url, options = {}) {
  const url_string = String(url)
  const fetch_options = { ...options }

  // Node 18 fetch doesn't support custom agents directly, but undici
  // (which powers Node's fetch) accepts a dispatcher. For HTTPS to
  // localhost, disable TLS verification via env var scoped to this call.
  const is_local_https = url_string.startsWith('https://127.0.0.1') ||
    url_string.startsWith('https://localhost')

  try {
    const { default: config } = await import('#config')
    if (config.jwt?.secret && config.user_public_key) {
      const token = jwt.sign(
        { user_public_key: config.user_public_key },
        config.jwt.secret
      )
      const headers = new Headers(options.headers)
      headers.set('Authorization', `Bearer ${token}`)
      fetch_options.headers = headers
    }
  } catch {
    // config unavailable, proceed without auth
  }

  if (is_local_https) {
    const original = process.env.NODE_TLS_REJECT_UNAUTHORIZED
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
    try {
      return await fetch(url, fetch_options)
    } finally {
      if (original === undefined) {
        delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
      } else {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = original
      }
    }
  }

  return fetch(url, fetch_options)
}
