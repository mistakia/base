/**
 * FTS Query Helpers
 *
 * Shared utilities for composing FTS5 MATCH queries from user-supplied
 * free-text. The MATCH grammar treats several punctuation characters as
 * operators (`-` = NOT, `+` = column filter, `(` `)` `:` `*` `"` etc.) so
 * user text must be sanitized before being passed through.
 */

const MATCH_QUOTE_SAFE = /"/g

/**
 * Tokenize user-supplied query text into FTS5 phrase-quoted terms joined by
 * implicit AND. Each token is wrapped in double quotes so that `-`, `:`,
 * parentheses etc. inside the token are treated as literal characters.
 *
 * Empty input returns null -- callers should skip the FTS MATCH entirely.
 *
 * @param {string} query - Raw user query
 * @returns {string|null}
 */
export function build_fts_match_expression(query) {
  if (typeof query !== 'string') return null
  const trimmed = query.trim()
  if (!trimmed) return null

  const tokens = trimmed.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return null

  const quoted = tokens
    .map((token) => token.replace(MATCH_QUOTE_SAFE, ''))
    .filter(Boolean)
    .map((token) => `"${token}"`)

  if (quoted.length === 0) return null
  return quoted.join(' ')
}
