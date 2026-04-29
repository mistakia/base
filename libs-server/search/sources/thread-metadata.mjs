// FTS5 MATCH over threads_fts (title + short_description).

import { execute_sqlite_query } from '#libs-server/embedded-database-index/sqlite/sqlite-database-client.mjs'
import { build_fts_match_expression } from './fts-query.mjs'

const SOURCE_NAME = 'thread_metadata'

export async function search({
  query,
  candidate_limit = 100,
  no_limit = false,
  marker_open = '[',
  marker_close = ']'
}) {
  const match_expression = build_fts_match_expression(query)
  if (!match_expression) return []

  const select_sql = `
    SELECT
      thread_id,
      -bm25(threads_fts, 5.0, 1.0) AS raw_score,
      snippet(threads_fts, 1, ?, ?, '...', 16) AS title_snippet,
      snippet(threads_fts, 2, ?, ?, '...', 24) AS short_description_snippet
    FROM threads_fts
    WHERE threads_fts MATCH ?
    ORDER BY raw_score DESC
  `

  const marker_params = [
    marker_open,
    marker_close,
    marker_open,
    marker_close
  ]

  const sql = no_limit ? select_sql : `${select_sql} LIMIT ?`
  const parameters = no_limit
    ? [...marker_params, match_expression]
    : [...marker_params, match_expression, candidate_limit]

  const rows = await execute_sqlite_query({ query: sql, parameters })

  return rows.map((row) => {
    const title_matched = Boolean(
      row.title_snippet && row.title_snippet.includes(marker_open)
    )
    return {
      entity_uri: `user:thread/${row.thread_id}`,
      raw_score: row.raw_score,
      matched_field: title_matched ? 'title' : 'short_description',
      snippet: title_matched
        ? row.title_snippet
        : row.short_description_snippet || '',
      extras: { thread_id: row.thread_id },
      source: SOURCE_NAME
    }
  })
}

export default { search }
