/**
 * Utilities for fetching raw file content from Base servers.
 *
 * Base servers serve .md paths as React SPA pages by default.
 * Programmatic consumers must use ?raw=true to get raw file content.
 * This module handles URL normalization and response validation.
 */

import config from '#config'

/**
 * Ensure a URL will return raw file content instead of an SPA page.
 *
 * For Base server URLs (matching config.production_url), appends ?raw=true
 * so the raw file middleware serves the content directly.
 * Non-Base URLs are returned unchanged.
 *
 * @param {string} url - The URL to normalize
 * @returns {string} URL with raw parameter if needed
 */
export function ensure_raw_url(url) {
  const base_host = get_base_hostname()
  if (!base_host) {
    return url
  }

  try {
    const url_obj = new URL(url)
    if (url_obj.hostname === base_host && !url_obj.searchParams.has('raw')) {
      url_obj.searchParams.set('raw', 'true')
      return url_obj.toString()
    }
  } catch {
    // Invalid URL, return as-is
  }

  return url
}

/**
 * Validate that a fetch response contains raw content, not an HTML page.
 *
 * Throws if the response Content-Type indicates HTML, which means the server
 * served an SPA page instead of the raw file.
 *
 * @param {Response} response - Fetch Response object
 * @param {string} url - The URL that was fetched (for error messages)
 * @throws {Error} If response appears to be HTML instead of raw content
 */
export function validate_raw_response(response, url) {
  const content_type = response.headers.get('content-type') || ''
  if (content_type.includes('text/html')) {
    throw new Error(
      `Expected raw file content but received HTML from ${url}. ` +
        `The server may be returning an SPA page instead of the raw file. ` +
        `Try appending ?raw=true to the URL.`
    )
  }
}

/**
 * Extract the hostname from the configured production URL.
 *
 * @returns {string|null} Hostname or null if not configured
 */
function get_base_hostname() {
  const production_url = config.production_url
  if (!production_url) {
    return null
  }

  try {
    return new URL(production_url).hostname
  } catch {
    return null
  }
}
