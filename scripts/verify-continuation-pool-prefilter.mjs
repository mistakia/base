#!/usr/bin/env bun

/**
 * Verify the continuation-pool metadata prefilter.
 *
 * Confirms, for each validation thread:
 *   1. The metadata-only prefilter (has_continuation_prompt !== false and
 *      the 14-day window) collapses the candidate pool to the expected size
 *      without reading any candidate timelines.
 *   2. detect_continuation_source still scores the known-good source pair
 *      at the expected coverage.
 *
 * Usage: bun scripts/verify-continuation-pool-prefilter.mjs
 */

import {
  detect_continuation_source
} from '#libs-server/metadata/analyze-thread-relations.mjs'
import { read_thread_data } from '#libs-server/threads/thread-utils.mjs'
import {
  list_thread_ids,
  get_thread_metadata
} from '#libs-server/threads/list-threads.mjs'
import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'
import {
  execute_sqlite_query,
  is_sqlite_initialized
} from '#libs-server/embedded-database-index/sqlite/sqlite-database-client.mjs'

const MS_PER_DAY = 86400000
const CONTINUATION_WINDOW_DAYS = 14

const PAIRS = [
  {
    label: 'val1',
    analyzed: '4307a4de-9fed-568a-9944-c316e4f936ac',
    source: '1d149bdc-d695-5225-aa83-d552b690bf52',
    expected_coverage: 1.0,
    expected_pool_approx: 1655
  },
  {
    label: 'val2',
    analyzed: 'e70c12ec-f8a7-5b24-86d2-82494b30dadb',
    source: 'd7f92b3d-ef1a-53ac-9847-81a8b4cfebbe',
    expected_coverage: 0.487,
    expected_pool_approx: 1172
  },
  {
    label: 'val3',
    analyzed: '1bb2591e-3046-5e26-aef6-e8e97fee6698',
    source: '0035bbee-5ef7-5836-aeda-f35981d592d8',
    expected_coverage: 1.0,
    expected_pool_approx: 1446
  }
]

async function metadata_pool_size_fs({ analyzed_id, analyzed_created_at }) {
  const analyzed_created_ms = new Date(analyzed_created_at).getTime()
  const all_ids = await list_thread_ids({})
  const candidate_ids = all_ids.filter((id) => id !== analyzed_id)

  let kept = 0
  const metas = await Promise.all(
    candidate_ids.map((id) => get_thread_metadata({ thread_id: id }))
  )
  for (const metadata of metas) {
    if (!metadata) continue
    if (metadata.has_continuation_prompt === false) continue

    const source_created_ms = metadata.created_at
      ? new Date(metadata.created_at).getTime()
      : NaN
    if (Number.isNaN(source_created_ms)) continue
    if (source_created_ms > analyzed_created_ms) continue

    const source_updated_ms = metadata.updated_at
      ? new Date(metadata.updated_at).getTime()
      : source_created_ms
    const window_end_ms =
      (Number.isNaN(source_updated_ms) ? source_created_ms : source_updated_ms) +
      CONTINUATION_WINDOW_DAYS * MS_PER_DAY
    if (window_end_ms < analyzed_created_ms) continue

    kept++
  }
  return kept
}

async function metadata_pool_size_sql({ analyzed_id, analyzed_created_at }) {
  const analyzed_created_ms = new Date(analyzed_created_at).getTime()
  const window_start_iso = new Date(
    analyzed_created_ms - CONTINUATION_WINDOW_DAYS * MS_PER_DAY
  ).toISOString()
  const analyzed_created_iso = new Date(analyzed_created_ms).toISOString()

  const rows = await execute_sqlite_query({
    query: `
      SELECT COUNT(*) AS count
      FROM threads
      WHERE thread_id != ?
        AND (has_continuation_prompt IS NULL OR has_continuation_prompt = 1)
        AND created_at IS NOT NULL
        AND created_at <= ?
        AND COALESCE(updated_at, created_at) >= ?
    `,
    parameters: [analyzed_id, analyzed_created_iso, window_start_iso]
  })
  return rows[0]?.count ?? 0
}

async function main() {
  await embedded_index_manager.initialize()
  const sqlite_ready = is_sqlite_initialized()

  const results = []
  for (const pair of PAIRS) {
    const { metadata, timeline } = await read_thread_data({
      thread_id: pair.analyzed
    })
    const analyzed_created_at = metadata.created_at

    const t_pool_start = Date.now()
    const pool_size = sqlite_ready
      ? await metadata_pool_size_sql({
          analyzed_id: pair.analyzed,
          analyzed_created_at
        })
      : await metadata_pool_size_fs({
          analyzed_id: pair.analyzed,
          analyzed_created_at
        })
    const pool_ms = Date.now() - t_pool_start

    const t_det_start = Date.now()
    const matches = await detect_continuation_source({
      thread_id: pair.analyzed,
      timeline,
      analyzed_created_at
    })
    const det_ms = Date.now() - t_det_start

    const match = matches.find((m) => m.source_thread_id === pair.source)
    results.push({
      label: pair.label,
      analyzed: pair.analyzed,
      pool_backend: sqlite_ready ? 'sqlite' : 'fs',
      pool_size,
      pool_ms,
      match_coverage: match ? match.coverage : null,
      expected_coverage: pair.expected_coverage,
      expected_pool_approx: pair.expected_pool_approx,
      detect_ms: det_ms,
      total_matches: matches.length
    })
  }

  console.log(JSON.stringify(results, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
