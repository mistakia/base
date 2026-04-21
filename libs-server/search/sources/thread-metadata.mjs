// FTS5 MATCH over threads_fts (title + short_description).

import debug from 'debug'

import { execute_sqlite_query } from '#libs-server/embedded-database-index/sqlite/sqlite-database-client.mjs'
import { build_fts_match_expression } from './fts-query.mjs'

const log = debug('search:sources:thread-metadata')

const SOURCE_NAME = 'thread_metadata'

export async function search({ query, candidate_limit = 100 }) {
  const match_expression = build_fts_match_expression(query)
  if (!match_expression) return []

  let rows
  try {
    rows = await execute_sqlite_query({
      query: `
        SELECT
          thread_id,
          -bm25(threads_fts, 5.0, 1.0) AS raw_score,
          snippet(threads_fts, 1, '[', ']', '...', 16) AS title_snippet,
          snippet(threads_fts, 2, '[', ']', '...', 24) AS short_description_snippet
        FROM threads_fts
        WHERE threads_fts MATCH ?
        ORDER BY raw_score DESC
        LIMIT ?
      `,
      parameters: [match_expression, candidate_limit]
    })
  } catch (error) {
    log('thread_metadata FTS query failed: %s', error.message)
    return []
  }

  return rows.map((row) => ({
    entity_uri: `user:thread/${row.thread_id}`,
    raw_score: row.raw_score,
    matched_field:
      row.title_snippet && row.title_snippet.includes('[')
        ? 'title'
        : 'short_description',
    snippet:
      row.title_snippet && row.title_snippet.includes('[')
        ? row.title_snippet
        : row.short_description_snippet || '',
    extras: { thread_id: row.thread_id },
    source: SOURCE_NAME
  }))
}

export default { search }
