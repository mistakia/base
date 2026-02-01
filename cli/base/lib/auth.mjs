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
 * Falls back to plain fetch() if token generation fails.
 *
 * @param {string|URL} url - Request URL
 * @param {RequestInit} [options={}] - Fetch options
 * @returns {Promise<Response>}
 */
export async function authenticated_fetch(url, options = {}) {
  try {
    const { default: config } = await import('#config')
    if (config.jwt?.secret && config.user_public_key) {
      const token = jwt.sign(
        { user_public_key: config.user_public_key },
        config.jwt.secret
      )
      const headers = new Headers(options.headers)
      headers.set('Authorization', `Bearer ${token}`)
      return fetch(url, { ...options, headers })
    }
  } catch {
    // config unavailable, proceed without auth
  }

  return fetch(url, options)
}
