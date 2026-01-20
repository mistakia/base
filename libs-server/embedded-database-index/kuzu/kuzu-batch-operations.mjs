/**
 * Kuzu Batch Operations
 *
 * Batched database operations with transaction support for improved performance.
 * Reduces database round-trips by grouping multiple operations.
 */

import debug from 'debug'
import { execute_parameterized_query } from './kuzu-utils.mjs'

const log = debug('embedded-index:kuzu:batch-operations')

/**
 * Batch upsert file references and create relationships to a thread
 * Groups operations to reduce database round-trips
 *
 * @param {Object} params Parameters
 * @param {Object} params.connection Kuzu database connection
 * @param {string} params.thread_id Thread ID
 * @param {Array<string>} params.file_references Array of file base URIs
 * @param {Array<string>} params.directory_references Array of directory base URIs
 * @param {number} [params.batch_size=50] Number of operations per batch
 * @returns {Promise<Object>} Result with counts { files_synced, directories_synced, errors }
 */
export async function batch_sync_file_references({
  connection,
  thread_id,
  file_references = [],
  directory_references = [],
  batch_size = 50
}) {
  if (!thread_id) {
    return { files_synced: 0, directories_synced: 0, errors: 0 }
  }

  const thread_base_uri = `user:thread/${thread_id}`
  const total_refs = file_references.length + directory_references.length

  if (total_refs === 0) {
    log('No file references to sync for thread: %s', thread_id)
    return { files_synced: 0, directories_synced: 0, errors: 0 }
  }

  log('Batch syncing %d file references for thread: %s', total_refs, thread_id)

  const result = {
    files_synced: 0,
    directories_synced: 0,
    errors: 0
  }

  // Delete existing file/directory relations from this thread
  try {
    const delete_query = `
      MATCH (t:Entity {base_uri: $thread_base_uri})-[r:RELATES_TO]->(f:Entity)
      WHERE f.type = 'file' OR f.type = 'directory'
      DELETE r
    `
    await execute_parameterized_query({
      connection,
      query: delete_query,
      params: { thread_base_uri }
    })
  } catch (error) {
    log('Error deleting existing file references: %s', error.message)
    result.errors++
  }

  // Process file references in batches
  for (let i = 0; i < file_references.length; i += batch_size) {
    const batch = file_references.slice(i, i + batch_size)
    const batch_results = await process_reference_batch({
      connection,
      thread_base_uri,
      references: batch,
      ref_type: 'file'
    })
    result.files_synced += batch_results.synced
    result.errors += batch_results.errors
  }

  // Process directory references in batches
  for (let i = 0; i < directory_references.length; i += batch_size) {
    const batch = directory_references.slice(i, i + batch_size)
    const batch_results = await process_reference_batch({
      connection,
      thread_base_uri,
      references: batch,
      ref_type: 'directory'
    })
    result.directories_synced += batch_results.synced
    result.errors += batch_results.errors
  }

  log(
    'Batch sync complete: %d files, %d directories, %d errors',
    result.files_synced,
    result.directories_synced,
    result.errors
  )

  return result
}

/**
 * Process a batch of references with error handling
 * Each reference is upserted and linked to the thread
 *
 * @param {Object} params Parameters
 * @param {Object} params.connection Kuzu database connection
 * @param {string} params.thread_base_uri Thread base URI
 * @param {Array<string>} params.references Array of reference base URIs
 * @param {string} params.ref_type Reference type ('file' or 'directory')
 * @returns {Promise<Object>} Result with counts { synced, errors }
 */
async function process_reference_batch({
  connection,
  thread_base_uri,
  references,
  ref_type
}) {
  const result = { synced: 0, errors: 0 }

  for (const ref_base_uri of references) {
    try {
      // Extract title from base_uri path
      const path_part = ref_base_uri.includes(':')
        ? ref_base_uri.split(':')[1]
        : ref_base_uri
      const path_parts = path_part.split('/')
      const title = path_parts[path_parts.length - 1] || ref_base_uri

      // Upsert the file/directory entity
      const upsert_query = `
        MERGE (e:Entity {base_uri: $base_uri})
        SET e.type = $type,
            e.title = $title
      `
      await execute_parameterized_query({
        connection,
        query: upsert_query,
        params: { base_uri: ref_base_uri, type: ref_type, title }
      })

      // Create relationship to thread (using MERGE to prevent duplicates)
      const merge_rel_query = `
        MATCH (t:Entity {base_uri: $thread_base_uri})
        MATCH (f:Entity {base_uri: $ref_base_uri})
        MERGE (t)-[r:RELATES_TO {relation_type: $relation_type}]->(f)
        SET r.context = $context
      `
      await execute_parameterized_query({
        connection,
        query: merge_rel_query,
        params: {
          thread_base_uri,
          ref_base_uri,
          relation_type: 'references',
          context: ''
        }
      })

      result.synced++
    } catch (error) {
      log(
        'Error syncing %s reference %s: %s',
        ref_type,
        ref_base_uri,
        error.message
      )
      result.errors++
    }
  }

  return result
}
