import DOMPurify from 'dompurify'

// MathML elements emitted by KaTeX when rendering math.
const KATEX_MATHML_TAGS = [
  'math',
  'semantics',
  'annotation',
  'mrow',
  'mi',
  'mo',
  'mn',
  'msup',
  'msub',
  'msubsup',
  'mfrac',
  'msqrt',
  'mroot',
  'mtext',
  'mspace',
  'mover',
  'munder',
  'munderover',
  'mtable',
  'mtr',
  'mtd',
  'mpadded',
  'mphantom',
  'mstyle',
  'merror',
  'menclose',
  'ms'
]

// Attributes required by KaTeX output. Note: `style` is allowed globally
// (DOMPurify's ADD_ATTR is not tag-scoped) because KaTeX emits inline `style`
// on <span> elements for glyph positioning, not on MathML elements -- a
// MathML-only allowance would not work. Legacy CSS-injection vectors
// (e.g. expression() in IE) are dead in modern browsers, and the renderer
// is single-tenant, so this scope expansion is acceptable.
const KATEX_EXTRA_ATTRS = [
  'xmlns',
  'encoding',
  'mathvariant',
  'stretchy',
  'lspace',
  'rspace',
  'displaystyle',
  'scriptlevel',
  'accent',
  'accentunder',
  'linethickness',
  'style'
]

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
  return DOMPurify.sanitize(html, {
    ADD_TAGS: KATEX_MATHML_TAGS,
    ADD_ATTR: ['target', ...KATEX_EXTRA_ATTRS]
  })
}
