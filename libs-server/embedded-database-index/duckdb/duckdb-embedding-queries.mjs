/**
 * DuckDB Embedding Queries
 *
 * Query functions for entity embedding CRUD and similarity search.
 */

import debug from 'debug'

import {
  execute_duckdb_query,
  execute_duckdb_run
} from './duckdb-database-client.mjs'

const log = debug('embedded-index:duckdb:embeddings')

/**
 * Upsert embeddings for an entity, replacing all existing chunks.
 * @param {object} params
 * @param {string} params.base_uri - Entity base URI
 * @param {Array<{chunk_index: number, content_hash: string, chunk_text: string, embedding: number[]}>} params.chunks
 */
export async function upsert_embeddings({ base_uri, chunks }) {
  log('Upserting %d embeddings for %s', chunks.length, base_uri)

  await execute_duckdb_run({ query: 'BEGIN TRANSACTION' })

  try {
    await execute_duckdb_run({
      query: 'DELETE FROM entity_embeddings WHERE base_uri = ?',
      parameters: [base_uri]
    })

    for (const chunk of chunks) {
      await execute_duckdb_run({
        query: `INSERT INTO entity_embeddings (base_uri, chunk_index, content_hash, chunk_text, embedding, updated_at)
                VALUES (?, ?, ?, ?, ?, NOW())`,
        parameters: [
          base_uri,
          chunk.chunk_index,
          chunk.content_hash,
          chunk.chunk_text,
          chunk.embedding
        ]
      })
    }

    await execute_duckdb_run({ query: 'COMMIT' })
    log('Upserted %d embeddings for %s', chunks.length, base_uri)
  } catch (error) {
    await execute_duckdb_run({ query: 'ROLLBACK' }).catch(() => {})
    throw error
  }
}

/**
 * Search for similar embeddings using cosine similarity.
 * @param {object} params
 * @param {number[]} params.embedding - Query embedding vector (768 dimensions)
 * @param {number} [params.limit=20] - Maximum number of results
 * @param {number} [params.similarity_threshold=0.3] - Minimum similarity score
 * @returns {Promise<Array<{base_uri: string, chunk_index: number, chunk_text: string, similarity_score: number}>>}
 */
export async function search_similar({
  embedding,
  limit = 20,
  similarity_threshold = 0.3
}) {
  log(
    'Searching similar embeddings (limit: %d, threshold: %s)',
    limit,
    similarity_threshold
  )

  const results = await execute_duckdb_query({
    query: `SELECT base_uri, chunk_index, chunk_text,
                   array_cosine_similarity(embedding, ?::FLOAT[768]) AS similarity_score
            FROM entity_embeddings
            WHERE array_cosine_similarity(embedding, ?::FLOAT[768]) >= ?
            ORDER BY similarity_score DESC
            LIMIT ?`,
    parameters: [embedding, embedding, similarity_threshold, limit]
  })

  log('Found %d similar embeddings', results.length)
  return results
}

/**
 * Delete all embedding chunks for an entity.
 * @param {object} params
 * @param {string} params.base_uri - Entity base URI
 */
export async function delete_entity_embeddings({ base_uri }) {
  log('Deleting embeddings for %s', base_uri)

  await execute_duckdb_run({
    query: 'DELETE FROM entity_embeddings WHERE base_uri = ?',
    parameters: [base_uri]
  })
}

/**
 * Get all embedding content hashes for staleness checking.
 * @returns {Promise<Array<{base_uri: string, chunk_index: number, content_hash: string}>>}
 */
export async function get_embedding_hashes() {
  log('Fetching embedding hashes')

  const results = await execute_duckdb_query({
    query:
      'SELECT base_uri, chunk_index, content_hash FROM entity_embeddings ORDER BY base_uri, chunk_index'
  })

  log('Found %d embedding hash entries', results.length)
  return results
}
