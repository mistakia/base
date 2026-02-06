import DOMPurify from 'dompurify'

/**
 * Sanitize HTML content to prevent XSS attacks.
 * Uses DOMPurify defaults which remove dangerous elements like script tags,
 * event handlers (onclick, onerror, etc.), and javascript: URLs.
 *
 * Note: DOMPurify requires a DOM environment (browser only).
 * This utility is client-side only and should not be used in Node.js contexts.
 *
 * @param {string} html - HTML string to sanitize
 * @returns {string} Sanitized HTML string
 */
export const sanitize_html = (html) => {
  if (!html) return ''
  return DOMPurify.sanitize(html)
}
