// Search orchestrator: runs source adapters in parallel, dedupes by
// entity_uri, attaches entity/thread metadata once, applies filters, ranks,
// paginates, and gates on deny-by-default permission.

import debug from 'debug'

import entity_source from './sources/entity.mjs'
import thread_metadata_source from './sources/thread-metadata.mjs'
import thread_timeline_source from './sources/thread-timeline.mjs'
import path_source from './sources/path.mjs'
import semantic_source from './sources/semantic.mjs'
import { apply_filters } from './filters.mjs'
import { rank } from './ranker.mjs'
import { permission_filter } from './permission.mjs'
import { load_search_config } from './search-config.mjs'
import { discover_external_search_sources } from './discover-external-sources.mjs'
import { execute_sqlite_query } from '#libs-server/embedded-database-index/sqlite/sqlite-database-client.mjs'
import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'

const log = debug('search:orchestrator')

const MAX_IN_CLAUSE = 900

const BUILTIN_ADAPTERS = {
  entity: entity_source,
  thread_metadata: thread_metadata_source,
  thread_timeline: thread_timeline_source,
  path: path_source,
  semantic: semantic_source
}

const BUILTIN_TIMED_SOURCES = new Set(['semantic'])

async function resolve_sources_registry() {
  const external = await discover_external_search_sources()
  const adapters = { ...BUILTIN_ADAPTERS }
  const timed = new Set(BUILTIN_TIMED_SOURCES)
  const external_names = []
  for (const entry of external) {
    adapters[entry.name] = entry.adapter
    if (entry.timed) timed.add(entry.name)
    external_names.push(entry.name)
  }
  return { adapters, timed, external_names }
}

async function run_source_with_timeout({
  name,
  query,
  candidate_limit,
  semantic_timeout_ms,
  source_options,
  adapters,
  timed_sources
}) {
  const adapter = adapters[name]
  if (!adapter) return []
  const per_source = (source_options && source_options[name]) || {}

  if (!timed_sources.has(name)) {
    try {
      return await adapter.search({ query, candidate_limit, ...per_source })
    } catch (error) {
      log('source %s failed: %s\n%s', name, error.message, error.stack)
      return []
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), semantic_timeout_ms)
  try {
    return await adapter.search({
      query,
      candidate_limit,
      ...per_source,
      signal: controller.signal
    })
  } catch (error) {
    if (error?.name === 'AbortError') return []
    log('source %s failed: %s', name, error.message)
    return []
  } finally {
    clearTimeout(timer)
  }
}

function dedupe_by_entity_uri(hits) {
  const by_uri = new Map()
  for (const hit of hits) {
    if (!hit.entity_uri) continue
    const match_entry = {
      source: hit.source,
      raw_score: hit.raw_score,
      matched_field: hit.matched_field,
      snippet: hit.snippet,
      extras: hit.extras
    }
    const existing = by_uri.get(hit.entity_uri)
    if (!existing) {
      by_uri.set(hit.entity_uri, {
        entity_uri: hit.entity_uri,
        matches: [match_entry]
      })
      continue
    }
    existing.matches.push(match_entry)
  }
  return [...by_uri.values()]
}

async function fetch_rows_chunked({ query, parameters }) {
  const out = []
  for (let i = 0; i < parameters.length; i += MAX_IN_CLAUSE) {
    const chunk = parameters.slice(i, i + MAX_IN_CLAUSE)
    const placeholders = chunk.map(() => '?').join(', ')
    const rows = await execute_sqlite_query({
      query: query.replace('?PLACEHOLDERS?', placeholders),
      parameters: chunk
    })
    out.push(...rows)
  }
  return out
}

async function attach_entity_metadata(hits) {
  if (hits.length === 0) return hits

  const entity_uris = []
  const thread_ids = []
  for (const hit of hits) {
    if (!SCHEME_PREFIX.test(hit.entity_uri)) continue
    if (hit.entity_uri.startsWith('user:thread/')) {
      thread_ids.push(hit.entity_uri.slice('user:thread/'.length))
    } else {
      entity_uris.push(hit.entity_uri)
    }
  }

  const entity_map = new Map()
  if (entity_uris.length > 0) {
    const rows = await fetch_rows_chunked({
      query: `SELECT base_uri, type, status, title, updated_at FROM entities WHERE base_uri IN (?PLACEHOLDERS?)`,
      parameters: entity_uris
    })
    for (const row of rows) entity_map.set(row.base_uri, row)
  }

  const thread_map = new Map()
  if (thread_ids.length > 0) {
    const rows = await fetch_rows_chunked({
      query: `SELECT thread_id, title, updated_at FROM threads WHERE thread_id IN (?PLACEHOLDERS?)`,
      parameters: thread_ids
    })
    for (const row of rows) thread_map.set(row.thread_id, row)
  }

  return hits.map((hit) => {
    if (!SCHEME_PREFIX.test(hit.entity_uri)) {
      const extras = hit.matches?.[0]?.extras || {}
      const preview = (extras.content_preview || '').slice(0, 80)
      const title = extras.channel_alias
        ? `#${extras.channel_alias} — ${preview}`
        : preview
      return {
        ...hit,
        type: 'discord_message',
        status: null,
        title,
        updated_at: extras.timestamp || null
      }
    }
    if (hit.entity_uri.startsWith('user:thread/')) {
      const thread_id = hit.entity_uri.slice('user:thread/'.length)
      const row = thread_map.get(thread_id)
      return {
        ...hit,
        type: 'thread',
        status: null,
        title: row?.title || '',
        updated_at: row?.updated_at || null
      }
    }
    const row = entity_map.get(hit.entity_uri)
    return {
      ...hit,
      type: row?.type || null,
      status: row?.status || null,
      title: row?.title || '',
      updated_at: row?.updated_at || null
    }
  })
}

const SCHEME_PREFIX = /^(?:user|sys):/

export async function search({
  query,
  sources,
  filters = {},
  limit = 20,
  offset = 0,
  user_public_key = null,
  source_options = {},
  permission_filter_fn = permission_filter
}) {
  return embedded_index_manager._with_reader(async () => {
    const config = await load_search_config()
    const { adapters, timed: timed_sources, external_names } = await resolve_sources_registry()
    const sources_config = config.sources || {}
    const configured_default = sources_config.enabled_by_default || [
      'entity',
      'thread_metadata',
      'thread_timeline',
      'path'
    ]
    const default_sources = [
      ...configured_default,
      ...external_names.filter((n) => !configured_default.includes(n))
    ]
    const active_sources =
      Array.isArray(sources) && sources.length > 0 ? sources : default_sources
    const candidate_limit = sources_config.per_source_candidate_cap || 100
    const semantic_timeout_ms = sources_config.semantic_timeout_ms || 2000

    const hits_by_source = await Promise.all(
      active_sources.map((name) =>
        run_source_with_timeout({
          name,
          query,
          candidate_limit,
          semantic_timeout_ms,
          source_options,
          adapters,
          timed_sources
        })
      )
    )

    const all_hits = hits_by_source.flat()
    const deduped = dedupe_by_entity_uri(all_hits)
    const with_metadata = await attach_entity_metadata(deduped)
    const filtered = await apply_filters({ hits: with_metadata, filters })
    const ranked = rank({ hits: filtered })

    const page = ranked.slice(offset, offset + limit)
    const permitted = await permission_filter_fn({
      hits: page,
      user_public_key
    })

    const results = permitted.map((hit) => ({
      entity_uri: hit.entity_uri,
      file_path: SCHEME_PREFIX.test(hit.entity_uri)
        ? hit.entity_uri.replace(SCHEME_PREFIX, '')
        : null,
      type: hit.type,
      title: hit.title,
      updated_at: hit.updated_at,
      score: hit.score,
      matches: hit.matches
    }))

    return { query, total: results.length, results }
  })
}
