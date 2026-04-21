// Thin wrapper over search_semantic; accepts AbortSignal so orchestrator
// timeouts cancel the in-flight Ollama fetch.

import debug from 'debug'

import { search_semantic } from '#libs-server/search/semantic-search-engine.mjs'

const log = debug('search:sources:semantic')

const SOURCE_NAME = 'semantic'

export async function search({ query, candidate_limit = 100, signal }) {
  if (!query || !query.trim()) return []

  const { results, available, aborted } = await search_semantic({
    query,
    limit: candidate_limit,
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
