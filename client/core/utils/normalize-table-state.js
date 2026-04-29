/**
 * Strip null/empty `q` before posting table_state to the server. The server
 * treats missing/empty/sub-3-char queries identically as no-op, so absence is
 * the canonical wire representation for "no quick-search active". Removing the
 * key keeps the wire payload clean and avoids ambiguous null/empty handling.
 */
export function normalize_q(table_state) {
  if (!table_state || typeof table_state.q === 'undefined') return table_state
  const { q, ...rest } = table_state
  if (q == null || (typeof q === 'string' && q.trim() === '')) {
    return rest
  }
  return { ...rest, q }
}
