// Filter application over deduped, metadata-attached hits. Type/status are
// read from the hit; tag membership requires a separate lookup.

import debug from 'debug'

import { execute_sqlite_query } from '#libs-server/embedded-database-index/sqlite/sqlite-database-client.mjs'

const log = debug('search:filters')

const MAX_IN_CLAUSE = 900

function glob_to_regex(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  const pattern = escaped.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*')
  return new RegExp(`^${pattern}$`)
}

async function fetch_tag_sets({ query, parameters, key_column }) {
  const map = new Map()
  if (parameters.length === 0) return map
  for (let i = 0; i < parameters.length; i += MAX_IN_CLAUSE) {
    const chunk = parameters.slice(i, i + MAX_IN_CLAUSE)
    const placeholders = chunk.map(() => '?').join(', ')
    const rows = await execute_sqlite_query({
      query: query.replace('?PLACEHOLDERS?', placeholders),
      parameters: chunk
    })
    for (const row of rows) {
      const key = row[key_column]
      if (!map.has(key)) map.set(key, new Set())
      map.get(key).add(row.tag_base_uri)
    }
  }
  return map
}

export async function apply_filters({ hits, filters }) {
  if (!hits || hits.length === 0) return []
  const { type, tag, status, path: path_glob } = filters || {}

  const has_type = Array.isArray(type) && type.length > 0
  const has_tag = Array.isArray(tag) && tag.length > 0
  const has_status = Array.isArray(status) && status.length > 0
  const has_path = typeof path_glob === 'string' && path_glob.length > 0

  if (!has_type && !has_tag && !has_status && !has_path) return hits

  const path_regex = has_path ? glob_to_regex(path_glob) : null

  let entity_tag_sets = new Map()
  let thread_tag_sets = new Map()
  if (has_tag) {
    const entity_uris = []
    const thread_ids = []
    for (const hit of hits) {
      if (!hit.entity_uri) continue
      if (hit.entity_uri.startsWith('user:thread/')) {
        thread_ids.push(hit.entity_uri.slice('user:thread/'.length))
      } else {
        entity_uris.push(hit.entity_uri)
      }
    }
    ;[entity_tag_sets, thread_tag_sets] = await Promise.all([
      fetch_tag_sets({
        query: `SELECT entity_base_uri, tag_base_uri FROM entity_tags WHERE entity_base_uri IN (?PLACEHOLDERS?)`,
        parameters: entity_uris,
        key_column: 'entity_base_uri'
      }),
      fetch_tag_sets({
        query: `SELECT thread_id, tag_base_uri FROM thread_tags WHERE thread_id IN (?PLACEHOLDERS?)`,
        parameters: thread_ids,
        key_column: 'thread_id'
      })
    ])
  }

  const filtered = []
  for (const hit of hits) {
    if (!hit.entity_uri) continue

    const is_thread = hit.entity_uri.startsWith('user:thread/')
    const is_path_source = hit.source === 'path'
    const thread_id = is_thread
      ? hit.entity_uri.slice('user:thread/'.length)
      : null

    if (has_type) {
      const effective_type = is_thread ? 'thread' : hit.type
      if (!effective_type || !type.includes(effective_type)) continue
    }

    if (has_status) {
      if (is_thread || is_path_source) continue
      if (!hit.status || !status.includes(hit.status)) continue
    }

    if (has_tag) {
      if (is_path_source) continue
      const tag_set = is_thread
        ? thread_tag_sets.get(thread_id)
        : entity_tag_sets.get(hit.entity_uri)
      if (!tag_set) continue
      if (!tag.some((t) => tag_set.has(t))) continue
    }

    if (has_path && !path_regex.test(hit.entity_uri)) continue

    filtered.push(hit)
  }

  log('apply_filters: %d/%d hits passed', filtered.length, hits.length)
  return filtered
}
