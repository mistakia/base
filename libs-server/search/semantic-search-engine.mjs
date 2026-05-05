/**
 * Semantic Search Engine
 *
 * Query-time semantic search using pre-computed entity embeddings.
 * Embeds the query via Ollama and performs cosine similarity search in SQLite.
 */

import debug from 'debug'

import { embed_texts } from '#libs-server/llm/embedding-client.mjs'
import { search_similar } from '#libs-server/embedded-database-index/sqlite/sqlite-embedding-queries.mjs'
import { execute_sqlite_query } from '#libs-server/embedded-database-index/sqlite/sqlite-database-client.mjs'

const log = debug('search:semantic')

/**
 * Perform semantic search using pre-computed embeddings.
 *
 * @param {Object} params
 * @param {string} params.query - Natural language search query
 * @param {number} [params.limit=20] - Maximum results to return
 * @param {number} [params.similarity_threshold=0.3] - Minimum similarity score
 * @returns {Promise<{results: Array<Object>, available: boolean}>}
 */
export async function search_semantic({
  query,
  limit = 20,
  similarity_threshold = 0.3,
  signal
}) {
  if (!query || !query.trim()) {
    return { results: [], available: true }
  }

  log('Semantic search: "%s" (limit: %d)', query, limit)

  let query_embedding
  try {
    const { embeddings } = await embed_texts({ texts: [query], signal })
    query_embedding = embeddings[0]
  } catch (error) {
    if (error.name === 'AbortError') {
      log('Semantic search aborted')
      return { results: [], available: true, aborted: true }
    }
    log('Ollama unavailable for semantic search: %s', error.message)
    return { results: [], available: false }
  }

  try {
    const similar_chunks = await search_similar({
      embedding: query_embedding,
      limit,
      similarity_threshold
    })

    if (similar_chunks.length === 0) {
      return { results: [], available: true }
    }

    // Fetch entity metadata for the matching base_uris
    const unique_base_uris = [...new Set(similar_chunks.map((c) => c.base_uri))]
    const entity_metadata = await fetch_entity_metadata({
      base_uris: unique_base_uris
    })

    const results = similar_chunks.map((chunk) => {
      const entity = entity_metadata.get(chunk.base_uri) || {}
      return {
        base_uri: chunk.base_uri,
        title: entity.title || '',
        description: entity.description || '',
        type: entity.type || '',
        similarity_score: chunk.similarity_score,
        chunk_text: chunk.chunk_text,
        chunk_index: chunk.chunk_index
      }
    })

    log('Semantic search returned %d results', results.length)
    return { results, available: true }
  } catch (error) {
    log('Semantic search query failed: %s', error.message)
    return { results: [], available: true }
  }
}

/**
 * Fetch entity metadata from the entities table for a list of base_uris.
 *
 * @param {Object} params
 * @param {string[]} params.base_uris - Entity base URIs to look up
 * @returns {Promise<Map<string, {title: string, description: string, type: string}>>}
 */
async function fetch_entity_metadata({ base_uris }) {
  const metadata_map = new Map()

  if (base_uris.length === 0) return metadata_map

  const placeholders = base_uris.map(() => '?').join(', ')
  const rows = await execute_sqlite_query({
    query: `SELECT base_uri, title, description, type FROM entities WHERE base_uri IN (${placeholders})`,
    parameters: base_uris
  })

  for (const row of rows) {
    metadata_map.set(row.base_uri, {
      title: row.title,
      description: row.description,
      type: row.type
    })
  }

  return metadata_map
}
