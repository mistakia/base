/**
 * Shared filename sanitization utilities
 */

import debug from 'debug'

const log = debug('utils:sanitize-filename')

/**
 * Sanitize a string for use in file paths
 * @param {string} input - Input string to sanitize
 * @param {Object} options - Sanitization options
 * @param {number} options.maxLength - Maximum length for the sanitized string (default: 100)
 * @param {string} options.fallback - Fallback string if input becomes empty (default: 'untitled')
 * @returns {string} Sanitized string safe for file paths
 */
export function sanitize_for_filename(input, options = {}) {
  const { maxLength = 100, fallback = 'untitled' } = options

  if (!input || typeof input !== 'string') {
    return fallback
  }

  const sanitized = input
    .toLowerCase()
    .trim()
    .replace(/\//g, '-') // Replace forward slashes with hyphens
    .replace(/[<>:"|\\?*]/g, '') // Remove other invalid filename characters
    .replace(/[^\w\s-]/g, '') // Keep only word characters, spaces, and hyphens
    .replace(/_/g, '-') // Convert underscores to hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Remove multiple consecutive hyphens
    .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
    .substring(0, maxLength) // Limit length

  const result = sanitized || fallback

  log(`Sanitized "${input}" -> "${result}"`)
  return result
}

/**
 * Convert title to filename-safe format (alias for consistency with existing code)
 * @param {string} title - Title to convert
 * @param {Object} options - Sanitization options
 * @returns {string} Safe filename
 */
export function title_to_safe_filename(title, options = {}) {
  return sanitize_for_filename(title, options)
}
