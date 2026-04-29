// Filter-mode orchestrator entry: returns an unordered URI set and per-URI
// highlight ranges suitable for use as a table-endpoint filter.
//
// Distinct from orchestrator.search() in three ways: no per-source candidate
// cap (the table paginates the full URI set downstream), no ranker step (sort
// is owned by the table), and source dispatch is restricted to the FTS-backed
// sources whose snippets parse cleanly into ranges. Permission filtering is
// applied to the full URI set so the downstream endpoint trusts the list.

import debug from 'debug'

import entity_source from './sources/entity.mjs'
import thread_metadata_source from './sources/thread-metadata.mjs'
import thread_timeline_source from './sources/thread-timeline.mjs'
import { permission_filter } from './permission.mjs'
import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'
import { execute_sqlite_query } from '#libs-server/embedded-database-index/sqlite/sqlite-database-client.mjs'

const log = debug('search:filter-mode')

const SENTINEL_OPEN = '\u0002'
const SENTINEL_CLOSE = '\u0003'

// SQLite's default SQLITE_MAX_VARIABLE_NUMBER is 999. The downstream table
// processors expand uri_set_as_row_keys into a single `column IN (?, ?, ...)`
// clause via build_sqlite_where_clause, so the URI set must stay below that
// limit or the query throws / silently truncates. We pick the same 900 ceiling
// the orchestrator uses for its chunked metadata fetch (MAX_IN_CLAUSE).
const MAX_URI_SET_SIZE = 900

// Per-source FTS budget. Three FTS5 sources run in parallel; without a deadline
// a slow scan blocks the request indefinitely even if the client aborted.
const FTS_TIMEOUT_MS = 5000

const SOURCE_PRIORITY = {
  entity: 0,
  thread_metadata: 1,
  thread_timeline: 2
}

const SOURCES = [
  { name: 'entity', adapter: entity_source },
  { name: 'thread_metadata', adapter: thread_metadata_source },
  { name: 'thread_timeline', adapter: thread_timeline_source }
]

const SCHEME_PREFIX = /^(?:user|sys):/
const MAX_IN_CLAUSE = 900

const TITLE_FIELDS = new Set(['title', 'short_description'])

function parse_sentinel_snippet(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return { text: '', ranges: [] }
  }
  const ranges = []
  let stripped = ''
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch === SENTINEL_OPEN) {
      const close_idx = text.indexOf(SENTINEL_CLOSE, i + 1)
      if (close_idx === -1) {
        // Unclosed sentinel - drop and continue.
        i += 1
        continue
      }
      const inner = text.slice(i + 1, close_idx)
      ranges.push({ offset: stripped.length, length: inner.length })
      stripped += inner
      i = close_idx + 1
    } else if (ch === SENTINEL_CLOSE) {
      // Stray close sentinel - skip.
      i += 1
    } else {
      stripped += ch
      i += 1
    }
  }
  return { text: stripped, ranges }
}

function build_row_highlights({ matched_field, parsed }) {
  const cell_ranges = {}
  let snippet = null
  if (TITLE_FIELDS.has(matched_field)) {
    cell_ranges.title = parsed.ranges
  } else if (parsed.ranges.length > 0) {
    snippet = { text: parsed.text, ranges: parsed.ranges }
  }
  return { matched_field, cell_ranges, snippet }
}

async function run_source({ adapter, query, name }) {
  let timer
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      log('filter-mode source %s timed out after %dms', name, FTS_TIMEOUT_MS)
      resolve([])
    }, FTS_TIMEOUT_MS)
  })
  try {
    const search_promise = adapter
      .search({
        query,
        no_limit: true,
        marker_open: SENTINEL_OPEN,
        marker_close: SENTINEL_CLOSE
      })
      .catch((error) => {
        log(
          'filter-mode source %s failed: %s\n%s',
          name,
          error.message,
          error.stack
        )
        return []
      })
    return await Promise.race([search_promise, timeout])
  } finally {
    clearTimeout(timer)
  }
}

async function attach_metadata_for_type_filter(uri_list) {
  if (!Array.isArray(uri_list) || uri_list.length === 0) return new Map()
  const entity_uris = []
  const thread_ids = []
  for (const uri of uri_list) {
    if (!SCHEME_PREFIX.test(uri)) continue
    if (uri.startsWith('user:thread/')) {
      thread_ids.push(uri.slice('user:thread/'.length))
    } else {
      entity_uris.push(uri)
    }
  }

  const metadata = new Map()
  for (let i = 0; i < entity_uris.length; i += MAX_IN_CLAUSE) {
    const chunk = entity_uris.slice(i, i + MAX_IN_CLAUSE)
    const placeholders = chunk.map(() => '?').join(', ')
    const rows = await execute_sqlite_query({
      query: `SELECT base_uri, type FROM entities WHERE base_uri IN (${placeholders})`,
      parameters: chunk
    })
    for (const row of rows) {
      metadata.set(row.base_uri, { type: row.type })
    }
  }
  for (const thread_id of thread_ids) {
    metadata.set(`user:thread/${thread_id}`, { type: 'thread' })
  }
  return metadata
}

export async function orchestrator_filter_mode({
  query,
  type_filter = null,
  user_public_key = null,
  permission_filter_fn = permission_filter
} = {}) {
  if (typeof query !== 'string' || query.trim().length === 0) {
    return { uri_set: new Set(), highlights_by_uri: new Map() }
  }

  return embedded_index_manager._with_reader(async () => {
    const hits_by_source = await Promise.all(
      SOURCES.map(({ adapter, name }) => run_source({ adapter, query, name }))
    )

    const winning_hit_by_uri = new Map()
    SOURCES.forEach(({ name }, source_idx) => {
      const priority = SOURCE_PRIORITY[name]
      for (const hit of hits_by_source[source_idx]) {
        if (!hit || !hit.entity_uri) continue
        const existing = winning_hit_by_uri.get(hit.entity_uri)
        if (!existing || existing.priority > priority) {
          winning_hit_by_uri.set(hit.entity_uri, { hit, priority, source: name })
        }
      }
    })

    const all_uris = [...winning_hit_by_uri.keys()]
    if (all_uris.length === 0) {
      return { uri_set: new Set(), highlights_by_uri: new Map() }
    }

    const type_filter_arr = Array.isArray(type_filter)
      ? type_filter
      : typeof type_filter === 'string' && type_filter.length > 0
      ? [type_filter]
      : []

    let type_allowed = null
    if (type_filter_arr.length > 0) {
      const metadata = await attach_metadata_for_type_filter(all_uris)
      type_allowed = new Set()
      for (const uri of all_uris) {
        const meta = metadata.get(uri)
        if (meta && type_filter_arr.includes(meta.type)) type_allowed.add(uri)
      }
    }

    const candidate_uris = type_allowed
      ? all_uris.filter((uri) => type_allowed.has(uri))
      : all_uris

    const permitted_hits = await permission_filter_fn({
      hits: candidate_uris.map((uri) => ({ entity_uri: uri })),
      user_public_key
    })
    const permitted_uri_set = new Set(permitted_hits.map((h) => h.entity_uri))

    const uri_set = new Set()
    const highlights_by_uri = new Map()
    for (const uri of candidate_uris) {
      if (!permitted_uri_set.has(uri)) continue
      if (uri_set.size >= MAX_URI_SET_SIZE) break
      const winner = winning_hit_by_uri.get(uri)
      if (!winner) continue
      const parsed = parse_sentinel_snippet(winner.hit.snippet || '')
      const row_highlights = build_row_highlights({
        matched_field: winner.hit.matched_field,
        parsed
      })
      uri_set.add(uri)
      highlights_by_uri.set(uri, row_highlights)
    }

    return { uri_set, highlights_by_uri }
  })
}

export const SENTINELS = {
  open: SENTINEL_OPEN,
  close: SENTINEL_CLOSE
}

// Exported for unit testing.
export const _internal = {
  parse_sentinel_snippet,
  build_row_highlights,
  SOURCE_PRIORITY
}
