// FTS5 MATCH over thread_timeline_fts; one hit per matching turn.

import { execute_sqlite_query } from '#libs-server/embedded-database-index/sqlite/sqlite-database-client.mjs'
import { build_fts_match_expression } from './fts-query.mjs'

const SOURCE_NAME = 'thread_timeline'

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
      tt.thread_id AS thread_id,
      tt.turn_index AS turn_index,
      -bm25(thread_timeline_fts) AS raw_score,
      snippet(thread_timeline_fts, 0, ?, ?, '...', 24) AS turn_snippet
    FROM thread_timeline_fts
    JOIN thread_timeline AS tt
      ON tt.rowid = thread_timeline_fts.rowid
    WHERE thread_timeline_fts MATCH ?
    ORDER BY raw_score DESC
  `

  const sql = no_limit ? select_sql : `${select_sql} LIMIT ?`
  const parameters = no_limit
    ? [marker_open, marker_close, match_expression]
    : [marker_open, marker_close, match_expression, candidate_limit]

  const rows = await execute_sqlite_query({ query: sql, parameters })

  return rows.map((row) => ({
    entity_uri: `user:thread/${row.thread_id}`,
    raw_score: row.raw_score,
    matched_field: 'turn_text',
    snippet: row.turn_snippet || '',
    extras: { thread_id: row.thread_id, turn_index: row.turn_index },
    source: SOURCE_NAME
  }))
}

export default { search }
