/**
 * SQLite Embedding Queries
 *
 * Query functions for entity embedding CRUD and similarity search.
 * Drop-in replacement for duckdb-embedding-queries.mjs.
 *
 * Key differences from DuckDB:
 * - Embeddings stored as BLOB (serialized Float32Array buffer)
 * - No native array_cosine_similarity() -- computed in JS after fetching rows
 * - bun:sqlite db.function() is not available (as of bun 1.2.18)
 */

import debug from 'debug'

import {
  execute_sqlite_query,
  execute_sqlite_run
} from './sqlite-database-client.mjs'

const log = debug('embedded-index:sqlite:embeddings')

/**
 * Serialize a JS number array to a Buffer for BLOB storage.
 */
function serialize_embedding(embedding) {
  const float_array = new Float32Array(embedding)
  return Buffer.from(float_array.buffer)
}

/**
 * Deserialize a BLOB Buffer back to a JS number array.
 */
function deserialize_embedding(blob) {
  if (!blob) return null
  const buffer = Buffer.isBuffer(blob) ? blob : Buffer.from(blob)
  const float_array = new Float32Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength / Float32Array.BYTES_PER_ELEMENT
  )
  return Array.from(float_array)
}

/**
 * Compute cosine similarity between two vectors.
 */
function cosine_similarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0

  let dot_product = 0
  let magnitude_a = 0
  let magnitude_b = 0

  for (let i = 0; i < a.length; i++) {
    dot_product += a[i] * b[i]
    magnitude_a += a[i] * a[i]
    magnitude_b += b[i] * b[i]
  }

  const denominator = Math.sqrt(magnitude_a) * Math.sqrt(magnitude_b)
  if (denominator === 0) return 0

  return dot_product / denominator
}

/**
 * Upsert embeddings for an entity, replacing all existing chunks.
 */
export async function upsert_embeddings({ base_uri, chunks }) {
  log('Upserting %d embeddings for %s', chunks.length, base_uri)

  await execute_sqlite_run({ query: 'BEGIN TRANSACTION' })

  try {
    await execute_sqlite_run({
      query: 'DELETE FROM entity_embeddings WHERE base_uri = ?',
      parameters: [base_uri]
    })

    const updated_at = new Date().toISOString()

    for (const chunk of chunks) {
      const embedding_blob = serialize_embedding(chunk.embedding)
      await execute_sqlite_run({
        query: `INSERT INTO entity_embeddings (base_uri, chunk_index, content_hash, chunk_text, embedding, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)`,
        parameters: [
          base_uri,
          chunk.chunk_index,
          chunk.content_hash,
          chunk.chunk_text,
          embedding_blob,
          updated_at
        ]
      })
    }

    await execute_sqlite_run({ query: 'COMMIT' })
    log('Upserted %d embeddings for %s', chunks.length, base_uri)
  } catch (error) {
    await execute_sqlite_run({ query: 'ROLLBACK' }).catch(() => {})
    throw error
  }
}

/**
 * Search for similar embeddings using cosine similarity.
 * Fetches all embeddings and computes similarity in JS since bun:sqlite
 * does not support db.function() for custom SQL functions.
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

  const all_rows = await execute_sqlite_query({
    query: `SELECT base_uri, chunk_index, chunk_text, embedding
            FROM entity_embeddings`
  })

  const scored_results = []
  for (const row of all_rows) {
    const stored_embedding = deserialize_embedding(row.embedding)
    const score = cosine_similarity(embedding, stored_embedding)

    if (score >= similarity_threshold) {
      scored_results.push({
        base_uri: row.base_uri,
        chunk_index: row.chunk_index,
        chunk_text: row.chunk_text,
        similarity_score: score
      })
    }
  }

  scored_results.sort((a, b) => b.similarity_score - a.similarity_score)

  const results = scored_results.slice(0, limit)
  log('Found %d similar embeddings', results.length)
  return results
}

/**
 * Delete all embedding chunks for an entity.
 */
export async function delete_entity_embeddings({ base_uri }) {
  log('Deleting embeddings for %s', base_uri)

  await execute_sqlite_run({
    query: 'DELETE FROM entity_embeddings WHERE base_uri = ?',
    parameters: [base_uri]
  })
}

/**
 * Get all embedding content hashes for staleness checking.
 */
export async function get_embedding_hashes() {
  log('Fetching embedding hashes')

  const results = await execute_sqlite_query({
    query:
      'SELECT base_uri, chunk_index, content_hash FROM entity_embeddings ORDER BY base_uri, chunk_index'
  })

  log('Found %d embedding hash entries', results.length)
  return results
}
