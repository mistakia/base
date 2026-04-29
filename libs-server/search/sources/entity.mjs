// FTS5 MATCH over entities_fts with bm25(10.0, 3.0, 4.0, 1.0) weighting
// title > description > attributes > body.

import { execute_sqlite_query } from '#libs-server/embedded-database-index/sqlite/sqlite-database-client.mjs'
import { build_fts_match_expression } from './fts-query.mjs'

const SOURCE_NAME = 'entity'

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
      base_uri,
      -bm25(entities_fts, 10.0, 3.0, 4.0, 1.0) AS raw_score,
      snippet(entities_fts, 1, ?, ?, '...', 16) AS title_snippet,
      snippet(entities_fts, 2, ?, ?, '...', 24) AS description_snippet,
      snippet(entities_fts, 3, ?, ?, '...', 24) AS attributes_snippet,
      snippet(entities_fts, 4, ?, ?, '...', 24) AS body_snippet
    FROM entities_fts
    WHERE entities_fts MATCH ?
    ORDER BY raw_score DESC
  `

  const marker_params = [
    marker_open,
    marker_close,
    marker_open,
    marker_close,
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
    const { matched_field, snippet } = pick_best_snippet(row, marker_open)
    return {
      entity_uri: row.base_uri,
      raw_score: row.raw_score,
      matched_field,
      snippet,
      extras: {},
      source: SOURCE_NAME
    }
  })
}

function pick_best_snippet(row, marker_open) {
  if (row.title_snippet && row.title_snippet.includes(marker_open)) {
    return { matched_field: 'title', snippet: row.title_snippet }
  }
  if (
    row.description_snippet &&
    row.description_snippet.includes(marker_open)
  ) {
    return { matched_field: 'description', snippet: row.description_snippet }
  }
  if (row.attributes_snippet && row.attributes_snippet.includes(marker_open)) {
    return { matched_field: 'attributes', snippet: row.attributes_snippet }
  }
  if (row.body_snippet && row.body_snippet.includes(marker_open)) {
    return { matched_field: 'body', snippet: row.body_snippet }
  }
  return {
    matched_field: 'title',
    snippet: row.title_snippet || ''
  }
}

export default { search }
