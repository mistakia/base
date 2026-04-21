// Compose FTS5 MATCH expressions from free-text queries. Strip operator
// characters before phrase-quoting so a user-supplied `*` or `(` cannot
// produce an FTS5 syntax error.

// FTS5 operators and punctuation that must not appear inside a phrase-quoted
// token: `"`, `*`, `(`, `)`, `:`, `^`.
const MATCH_STRIP = /["*():^]/g

export function build_fts_match_expression(query) {
  if (typeof query !== 'string') return null
  const trimmed = query.trim()
  if (!trimmed) return null

  const tokens = trimmed.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return null

  const quoted = tokens
    .map((token) => token.replace(MATCH_STRIP, ''))
    .filter(Boolean)
    .map((token) => `"${token}"`)

  if (quoted.length === 0) return null
  return quoted.join(' ')
}
