/**
 * Semantic Source Adapter
 *
 * Thin wrapper over search_semantic. Accepts an AbortSignal so the
 * orchestrator's per-source timeout can cancel an in-flight Ollama embed
 * request rather than leaking the connection.
 */

import debug from 'debug'

import { search_semantic } from '#libs-server/search/semantic-search-engine.mjs'

const log = debug('search:sources:semantic')

const SOURCE_NAME = 'semantic'

export async function search({
  query,
  candidate_limit = 100,
  similarity_threshold = 0.3,
  signal
}) {
  if (!query || !query.trim()) return []

  const { results, available, aborted } = await search_semantic({
    query,
    limit: candidate_limit,
    similarity_threshold,
    signal
  })

  if (aborted) {
    log('semantic source aborted')
    return []
  }
  if (!available) {
    log('semantic source unavailable (ollama down)')
    return []
  }

  return results.map((result) => ({
    entity_uri: result.base_uri,
    raw_score: result.similarity_score,
    matched_field: 'semantic',
    snippet: result.chunk_text || '',
    extras: {
      chunk_index: result.chunk_index,
      similarity_score: result.similarity_score
    },
    source: SOURCE_NAME
  }))
}

export default { search }
