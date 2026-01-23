/**
 * Path Utilities
 *
 * Shared path manipulation functions for consistent path handling
 * across client and server code.
 */

/**
 * Normalize a file path by removing leading slashes
 * @param {string} path - The file path to normalize
 * @returns {string} The normalized path without leading slash
 */
export function normalize_file_path(path) {
  if (!path) return ''
  return path.startsWith('/') ? path.slice(1) : path
}
