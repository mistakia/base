/**
 * Search Filters
 *
 * Uniform filter application over ranked hits. Filters lookup each hit's
 * entity_uri against the entities / threads tables via a single SQL batch
 * round-trip and drop hits that fail to resolve or that mismatch the
 * supplied filter values.
 *
 * Supported filters (all optional, all CSV-parsed upstream):
 *   - type    - entity.type IN (...) OR thread (for thread_* entity_uris)
 *   - tag     - entity_tags / thread_tags OR membership
 *   - status  - entity.status IN (...) (threads are never status-matched)
 *   - path    - glob match against entity_uri
 */

import debug from 'debug'

import { execute_sqlite_query } from '#libs-server/embedded-database-index/sqlite/sqlite-database-client.mjs'

const log = debug('search:filters')

function glob_to_regex(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  const pattern = escaped.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*')
  return new RegExp(`^${pattern}$`)
}

async function fetch_entity_metadata(base_uris) {
  if (base_uris.length === 0) return new Map()
  const placeholders = base_uris.map(() => '?').join(', ')
  const rows = await execute_sqlite_query({
    query: `SELECT base_uri, type, status FROM entities WHERE base_uri IN (${placeholders})`,
    parameters: base_uris
  })
  const map = new Map()
  for (const row of rows) {
    map.set(row.base_uri, row)
  }
  return map
}

async function fetch_entity_tag_sets(base_uris) {
  if (base_uris.length === 0) return new Map()
  const placeholders = base_uris.map(() => '?').join(', ')
  const rows = await execute_sqlite_query({
    query: `SELECT entity_base_uri, tag_base_uri FROM entity_tags WHERE entity_base_uri IN (${placeholders})`,
    parameters: base_uris
  })
  const map = new Map()
  for (const row of rows) {
    if (!map.has(row.entity_base_uri)) map.set(row.entity_base_uri, new Set())
    map.get(row.entity_base_uri).add(row.tag_base_uri)
  }
  return map
}

async function fetch_thread_tag_sets(thread_ids) {
  if (thread_ids.length === 0) return new Map()
  const placeholders = thread_ids.map(() => '?').join(', ')
  const rows = await execute_sqlite_query({
    query: `SELECT thread_id, tag_base_uri FROM thread_tags WHERE thread_id IN (${placeholders})`,
    parameters: thread_ids
  })
  const map = new Map()
  for (const row of rows) {
    if (!map.has(row.thread_id)) map.set(row.thread_id, new Set())
    map.get(row.thread_id).add(row.tag_base_uri)
  }
  return map
}

/**
 * Apply filters to a list of hits. Non-matching or unresolvable hits are
 * dropped (deny-by-default for "can't evaluate this filter").
 *
 * @param {Object} params
 * @param {Array<Object>} params.hits
 * @param {Object} params.filters - {type, tag, status, path} arrays/strings
 * @returns {Promise<Array<Object>>}
 */
export async function apply_filters({ hits, filters }) {
  if (!hits || hits.length === 0) return []
  const { type, tag, status, path: path_glob } = filters || {}

  const has_type = Array.isArray(type) && type.length > 0
  const has_tag = Array.isArray(tag) && tag.length > 0
  const has_status = Array.isArray(status) && status.length > 0
  const has_path = typeof path_glob === 'string' && path_glob.length > 0

  if (!has_type && !has_tag && !has_status && !has_path) {
    return hits
  }

  const path_regex = has_path ? glob_to_regex(path_glob) : null

  const entity_uris = new Set()
  const thread_ids = new Set()
  for (const hit of hits) {
    if (!hit.entity_uri) continue
    if (hit.entity_uri.startsWith('user:thread/')) {
      thread_ids.add(hit.entity_uri.slice('user:thread/'.length))
    } else {
      entity_uris.add(hit.entity_uri)
    }
  }

  const [entity_metadata, entity_tags, thread_tags] = await Promise.all([
    fetch_entity_metadata([...entity_uris]),
    has_tag ? fetch_entity_tag_sets([...entity_uris]) : new Map(),
    has_tag ? fetch_thread_tag_sets([...thread_ids]) : new Map()
  ])

  const filtered = []
  for (const hit of hits) {
    if (!hit.entity_uri) continue

    const is_thread = hit.entity_uri.startsWith('user:thread/')
    const thread_id = is_thread
      ? hit.entity_uri.slice('user:thread/'.length)
      : null
    const entity_row = is_thread ? null : entity_metadata.get(hit.entity_uri)

    if (has_type) {
      const effective_type = is_thread ? 'thread' : entity_row?.type
      if (!effective_type || !type.includes(effective_type)) continue
    } else if (!is_thread && !entity_row) {
      log('Dropping unresolvable entity_uri: %s', hit.entity_uri)
      continue
    }

    if (has_status) {
      if (is_thread) continue
      if (!entity_row || !status.includes(entity_row.status)) continue
    }

    if (has_tag) {
      const tag_set = is_thread
        ? thread_tags.get(thread_id)
        : entity_tags.get(hit.entity_uri)
      if (!tag_set) continue
      const any_match = tag.some((t) => tag_set.has(t))
      if (!any_match) continue
    }

    if (has_path) {
      if (!path_regex.test(hit.entity_uri)) continue
    }

    filtered.push(hit)
  }

  return filtered
}

export default { apply_filters }
