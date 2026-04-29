// Shared helper for table request processors that translates a `q` parameter
// into a row-keyed highlight map plus a URI set the processor can convert into
// an IN filter. Centralizes the 3-character minimum, the rekeying from
// entity_uri to the entity-type-specific row key, and the call into the
// filter-mode orchestrator. See system/text/search-system-design.md.

import { orchestrator_filter_mode } from '#libs-server/search/filter-mode.mjs'

const MIN_QUERY_LENGTH = 3

const ENTITY_TYPE_TO_ROW_KEY = {
  thread: 'thread_id',
  task: 'base_uri'
}

function extract_thread_id(uri) {
  if (typeof uri !== 'string') return null
  if (!uri.startsWith('user:thread/')) return null
  const id = uri.slice('user:thread/'.length)
  return id || null
}

export async function resolve_table_search({
  q,
  entity_type,
  requesting_user_public_key = null,
  // Injected for testability; defaults to the real filter-mode orchestrator.
  filter_mode_fn = orchestrator_filter_mode
} = {}) {
  if (typeof q !== 'string') return null
  const trimmed = q.trim()
  if (trimmed.length < MIN_QUERY_LENGTH) return null

  const row_key = ENTITY_TYPE_TO_ROW_KEY[entity_type]
  if (!row_key) {
    throw new Error(
      `resolve_table_search: unsupported entity_type "${entity_type}"`
    )
  }

  const { uri_set, highlights_by_uri } = await filter_mode_fn({
    query: trimmed,
    type_filter: entity_type,
    user_public_key: requesting_user_public_key
  })

  const uri_set_as_row_keys = []
  const row_highlights = new Map()

  for (const uri of uri_set) {
    let key
    if (entity_type === 'thread') {
      key = extract_thread_id(uri)
    } else {
      key = uri
    }
    if (!key) continue
    uri_set_as_row_keys.push(key)
    const highlights = highlights_by_uri.get(uri)
    if (highlights) row_highlights.set(key, highlights)
  }

  return {
    uri_set,
    row_key,
    uri_set_as_row_keys,
    row_highlights
  }
}

export const TABLE_SEARCH_MIN_QUERY_LENGTH = MIN_QUERY_LENGTH
