/**
 * DuckDB Entity Sync
 *
 * Functions for syncing tasks, threads, tags, and relations to DuckDB.
 */

import debug from 'debug'

import { execute_duckdb_run } from './duckdb-database-client.mjs'

const log = debug('embedded-index:duckdb:sync')

export async function upsert_thread_to_duckdb({ thread_data }) {
  const {
    thread_id,
    title,
    short_description,
    thread_state,
    created_at,
    updated_at,
    message_count,
    user_message_count,
    assistant_message_count,
    tool_call_count,
    total_input_tokens,
    total_output_tokens,
    cache_creation_input_tokens,
    cache_read_input_tokens,
    total_tokens,
    duration_ms,
    duration_minutes,
    working_directory,
    working_directory_path,
    session_provider,
    inference_provider,
    user_public_key,
    latest_event_timestamp,
    latest_event_type,
    latest_event_data,
    edit_count,
    lines_changed,
    file_references,
    directory_references
  } = thread_data

  // Derive primary_model from nested path if not directly set
  const primary_model =
    thread_data.primary_model ||
    (thread_data.models && thread_data.models[0]) ||
    thread_data.external_session?.provider_metadata?.models?.[0] ||
    null

  if (!thread_id) {
    log('Cannot upsert thread without thread_id')
    return
  }

  log('Upserting thread to DuckDB: %s', thread_id)

  const query = `
    INSERT INTO threads (
      thread_id, title, short_description, thread_state, created_at, updated_at,
      message_count, user_message_count, assistant_message_count, tool_call_count,
      total_input_tokens, total_output_tokens, cache_creation_input_tokens,
      cache_read_input_tokens, total_tokens, duration_ms, duration_minutes,
      working_directory, working_directory_path, session_provider,
      inference_provider, primary_model, user_public_key,
      latest_event_timestamp, latest_event_type, latest_event_data,
      edit_count, lines_changed, file_references, directory_references
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (thread_id) DO UPDATE SET
      title = excluded.title,
      short_description = excluded.short_description,
      thread_state = excluded.thread_state,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      message_count = excluded.message_count,
      user_message_count = excluded.user_message_count,
      assistant_message_count = excluded.assistant_message_count,
      tool_call_count = excluded.tool_call_count,
      total_input_tokens = excluded.total_input_tokens,
      total_output_tokens = excluded.total_output_tokens,
      cache_creation_input_tokens = excluded.cache_creation_input_tokens,
      cache_read_input_tokens = excluded.cache_read_input_tokens,
      total_tokens = excluded.total_tokens,
      duration_ms = excluded.duration_ms,
      duration_minutes = excluded.duration_minutes,
      working_directory = excluded.working_directory,
      working_directory_path = excluded.working_directory_path,
      session_provider = excluded.session_provider,
      inference_provider = excluded.inference_provider,
      primary_model = excluded.primary_model,
      user_public_key = excluded.user_public_key,
      latest_event_timestamp = excluded.latest_event_timestamp,
      latest_event_type = excluded.latest_event_type,
      latest_event_data = excluded.latest_event_data,
      edit_count = excluded.edit_count,
      lines_changed = excluded.lines_changed,
      file_references = excluded.file_references,
      directory_references = excluded.directory_references
  `

  try {
    await execute_duckdb_run({
      query,
      parameters: [
        thread_id,
        title,
        short_description,
        thread_state,
        created_at,
        updated_at,
        message_count ?? 0,
        user_message_count ?? 0,
        assistant_message_count ?? 0,
        tool_call_count ?? 0,
        total_input_tokens ?? 0,
        total_output_tokens ?? 0,
        cache_creation_input_tokens ?? 0,
        cache_read_input_tokens ?? 0,
        total_tokens ?? 0,
        duration_ms ?? 0,
        duration_minutes ?? 0,
        working_directory,
        working_directory_path,
        session_provider,
        inference_provider,
        primary_model,
        user_public_key,
        latest_event_timestamp,
        latest_event_type,
        latest_event_data,
        edit_count ?? 0,
        lines_changed ?? 0,
        file_references ?? null,
        directory_references ?? null
      ]
    })
    log('Thread upserted: %s', thread_id)
  } catch (error) {
    log('Error upserting thread: %s', error.message)
    throw error
  }
}

export async function sync_entity_tags_to_duckdb({
  entity_base_uri,
  tag_base_uris
}) {
  if (!entity_base_uri) {
    return
  }

  log(
    'Syncing %d tags for entity: %s',
    tag_base_uris?.length || 0,
    entity_base_uri
  )

  try {
    // Delete existing tags for this entity
    await execute_duckdb_run({
      query: 'DELETE FROM entity_tags WHERE entity_base_uri = ?',
      parameters: [entity_base_uri]
    })

    // Insert new tags (dedupe to handle entities with duplicate tags in frontmatter)
    if (tag_base_uris && tag_base_uris.length > 0) {
      const unique_tags = [...new Set(tag_base_uris)]

      // Use batch insert for multiple tags
      const placeholders = unique_tags.map(() => '(?, ?)').join(', ')
      const parameters = unique_tags.flatMap((tag_base_uri) => [
        entity_base_uri,
        tag_base_uri
      ])

      await execute_duckdb_run({
        query: `INSERT INTO entity_tags (entity_base_uri, tag_base_uri) VALUES ${placeholders}`,
        parameters
      })
    }

    log('Entity tags synced: %s', entity_base_uri)
  } catch (error) {
    log('Error syncing entity tags: %s', error.message)
    throw error
  }
}

export async function sync_entity_relations_to_duckdb({
  source_base_uri,
  relations
}) {
  if (!source_base_uri) {
    return
  }

  log(
    'Syncing %d relations for entity: %s',
    relations?.length || 0,
    source_base_uri
  )

  try {
    // Delete existing relations from this entity
    await execute_duckdb_run({
      query: 'DELETE FROM entity_relations WHERE source_base_uri = ?',
      parameters: [source_base_uri]
    })

    // Insert new relations
    if (relations && relations.length > 0) {
      // Filter relations with valid target_base_uri
      const valid_relations = relations.filter((r) => r.target_base_uri)

      if (valid_relations.length > 0) {
        // Use batch insert for multiple relations
        const placeholders = valid_relations
          .map(() => '(?, ?, ?, ?)')
          .join(', ')
        const parameters = valid_relations.flatMap((relation) => [
          source_base_uri,
          relation.target_base_uri,
          relation.relation_type || 'unknown',
          relation.context || null
        ])

        await execute_duckdb_run({
          query: `INSERT INTO entity_relations (source_base_uri, target_base_uri, relation_type, context)
                  VALUES ${placeholders}
                  ON CONFLICT DO UPDATE SET context = excluded.context`,
          parameters
        })
      }
    }

    log('Entity relations synced: %s', source_base_uri)
  } catch (error) {
    log('Error syncing entity relations: %s', error.message)
    throw error
  }
}

export async function delete_thread_from_duckdb({ thread_id }) {
  if (!thread_id) {
    return
  }

  log('Deleting thread from DuckDB: %s', thread_id)

  try {
    await execute_duckdb_run({
      query: 'DELETE FROM threads WHERE thread_id = ?',
      parameters: [thread_id]
    })
    log('Thread deleted: %s', thread_id)
  } catch (error) {
    log('Error deleting thread: %s', error.message)
    throw error
  }
}

/**
 * Upsert any entity type to unified entities table
 *
 * @param {Object} params - Parameters
 * @param {Object} params.entity_data - Entity data with frontmatter
 * @param {Object} params.entity_data.frontmatter - Full frontmatter object
 * @param {string} params.entity_data.base_uri - Entity base URI
 * @param {string} params.entity_data.entity_id - Entity UUID
 * @param {string} params.entity_data.type - Entity type
 */
export async function upsert_entity_to_duckdb({ entity_data }) {
  const { frontmatter, base_uri, entity_id, type } = entity_data

  if (!base_uri || !entity_id || !type) {
    log('Cannot upsert entity without base_uri, entity_id, and type')
    return
  }

  log('Upserting entity to DuckDB: %s (%s)', base_uri, type)

  // Extract common columns from frontmatter
  const title = frontmatter?.title || null
  const description = frontmatter?.description || null
  const status = frontmatter?.status || null
  const priority = frontmatter?.priority || null
  const archived = frontmatter?.archived || false
  const user_public_key =
    frontmatter?.user_public_key || entity_data.user_public_key
  // created_at and updated_at are NOT NULL in schema, provide defaults
  const now = new Date().toISOString()
  const created_at = frontmatter?.created_at || now
  const updated_at = frontmatter?.updated_at || now
  const archived_at = frontmatter?.archived_at || null

  const query = `
    INSERT INTO entities (
      base_uri, entity_id, type, title, description, status, priority,
      archived, user_public_key, created_at, updated_at, archived_at, frontmatter
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (base_uri) DO UPDATE SET
      entity_id = excluded.entity_id,
      type = excluded.type,
      title = excluded.title,
      description = excluded.description,
      status = excluded.status,
      priority = excluded.priority,
      archived = excluded.archived,
      user_public_key = excluded.user_public_key,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      archived_at = excluded.archived_at,
      frontmatter = excluded.frontmatter
  `

  try {
    await execute_duckdb_run({
      query,
      parameters: [
        base_uri,
        entity_id,
        type,
        title,
        description,
        status,
        priority,
        archived,
        user_public_key,
        created_at,
        updated_at,
        archived_at,
        JSON.stringify(frontmatter || {})
      ]
    })
    log('Entity upserted: %s', base_uri)
  } catch (error) {
    log('Error upserting entity: %s', error.message)
    throw error
  }
}

/**
 * Delete entity from unified entities table
 *
 * @param {Object} params - Parameters
 * @param {string} [params.entity_id] - Entity UUID
 * @param {string} [params.base_uri] - Entity base URI (required for proper cleanup)
 */
export async function delete_entity_from_duckdb({ entity_id, base_uri }) {
  if (!base_uri && !entity_id) {
    log('Cannot delete entity without base_uri or entity_id')
    return
  }

  log('Deleting entity from DuckDB: %s', entity_id || base_uri)

  try {
    // Resolve base_uri for consistent cleanup of all related data
    let resolved_base_uri = base_uri
    if (!resolved_base_uri && entity_id) {
      const { execute_duckdb_query } = await import(
        './duckdb-database-client.mjs'
      )
      const results = await execute_duckdb_query({
        query: 'SELECT base_uri FROM entities WHERE entity_id = ?',
        parameters: [entity_id]
      })
      resolved_base_uri = results[0]?.base_uri

      if (!resolved_base_uri) {
        log('Entity not found with entity_id: %s, skipping deletion', entity_id)
        return
      }
    }

    // Delete from entities table using resolved base_uri for consistency
    await execute_duckdb_run({
      query: 'DELETE FROM entities WHERE base_uri = ?',
      parameters: [resolved_base_uri]
    })

    // Delete related tags and relations
    await execute_duckdb_run({
      query: 'DELETE FROM entity_tags WHERE entity_base_uri = ?',
      parameters: [resolved_base_uri]
    })
    await execute_duckdb_run({
      query: 'DELETE FROM entity_relations WHERE source_base_uri = ?',
      parameters: [resolved_base_uri]
    })

    log('Entity deleted: %s', resolved_base_uri)
  } catch (error) {
    log('Error deleting entity: %s', error.message)
    throw error
  }
}

// ---------------------------------------------------------------------------
// Batch operations for full rebuild
// ---------------------------------------------------------------------------

export const BATCH_CHUNK_SIZE = 50

/**
 * Batch upsert multiple entities to unified entities table
 *
 * @param {Object} params - Parameters
 * @param {Array} params.entities - Array of entity data objects with frontmatter
 */
export async function upsert_entities_batch({ entities }) {
  if (!entities || entities.length === 0) return

  log('Batch upserting %d entities', entities.length)

  for (let i = 0; i < entities.length; i += BATCH_CHUNK_SIZE) {
    const chunk = entities.slice(i, i + BATCH_CHUNK_SIZE)

    const placeholders = chunk
      .map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .join(', ')

    const parameters = chunk.flatMap((entity_data) => {
      const { frontmatter, base_uri, entity_id, type } = entity_data
      const now = new Date().toISOString()

      return [
        base_uri,
        entity_id,
        type,
        frontmatter?.title || null,
        frontmatter?.description || null,
        frontmatter?.status || null,
        frontmatter?.priority || null,
        frontmatter?.archived || false,
        frontmatter?.user_public_key || entity_data.user_public_key,
        frontmatter?.created_at || now,
        frontmatter?.updated_at || now,
        frontmatter?.archived_at || null,
        JSON.stringify(frontmatter || {})
      ]
    })

    await execute_duckdb_run({
      query: `
        INSERT INTO entities (
          base_uri, entity_id, type, title, description, status, priority,
          archived, user_public_key, created_at, updated_at, archived_at, frontmatter
        ) VALUES ${placeholders}
        ON CONFLICT (base_uri) DO UPDATE SET
          entity_id = excluded.entity_id,
          type = excluded.type,
          title = excluded.title,
          description = excluded.description,
          status = excluded.status,
          priority = excluded.priority,
          archived = excluded.archived,
          user_public_key = excluded.user_public_key,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          archived_at = excluded.archived_at,
          frontmatter = excluded.frontmatter
      `,
      parameters
    })
  }

  log('Batch upserted %d entities', entities.length)
}

/**
 * Batch sync tags for multiple entities
 * Deletes all existing tags for the given entities, then inserts all new tags
 *
 * @param {Object} params - Parameters
 * @param {Array} params.entity_tags - Array of { entity_base_uri, tag_base_uris }
 */
export async function sync_entities_tags_batch({ entity_tags }) {
  if (!entity_tags || entity_tags.length === 0) return

  // Collect all base_uris for batch delete
  const entity_base_uris = entity_tags.map((et) => et.entity_base_uri)

  log('Batch syncing tags for %d entities', entity_base_uris.length)

  // Batch delete existing tags for all entities
  for (let i = 0; i < entity_base_uris.length; i += BATCH_CHUNK_SIZE) {
    const chunk = entity_base_uris.slice(i, i + BATCH_CHUNK_SIZE)
    const placeholders = chunk.map(() => '?').join(', ')

    await execute_duckdb_run({
      query: `DELETE FROM entity_tags WHERE entity_base_uri IN (${placeholders})`,
      parameters: chunk
    })
  }

  // Flatten all tag pairs for batch insert
  const all_tag_pairs = []
  for (const { entity_base_uri, tag_base_uris } of entity_tags) {
    if (tag_base_uris && tag_base_uris.length > 0) {
      const unique_tags = [...new Set(tag_base_uris)]
      for (const tag_base_uri of unique_tags) {
        all_tag_pairs.push([entity_base_uri, tag_base_uri])
      }
    }
  }

  // Batch insert all tags
  for (let i = 0; i < all_tag_pairs.length; i += BATCH_CHUNK_SIZE) {
    const chunk = all_tag_pairs.slice(i, i + BATCH_CHUNK_SIZE)
    const placeholders = chunk.map(() => '(?, ?)').join(', ')
    const parameters = chunk.flat()

    await execute_duckdb_run({
      query: `INSERT INTO entity_tags (entity_base_uri, tag_base_uri) VALUES ${placeholders}`,
      parameters
    })
  }

  log(
    'Batch synced %d tag pairs for %d entities',
    all_tag_pairs.length,
    entity_base_uris.length
  )
}

/**
 * Batch sync relations for multiple entities
 * Deletes all existing relations for the given entities, then inserts all new relations
 *
 * @param {Object} params - Parameters
 * @param {Array} params.entity_relations - Array of { source_base_uri, relations }
 */
export async function sync_entities_relations_batch({ entity_relations }) {
  if (!entity_relations || entity_relations.length === 0) return

  // Collect all source_base_uris for batch delete
  const source_base_uris = entity_relations.map((er) => er.source_base_uri)

  log('Batch syncing relations for %d entities', source_base_uris.length)

  // Batch delete existing relations for all entities
  for (let i = 0; i < source_base_uris.length; i += BATCH_CHUNK_SIZE) {
    const chunk = source_base_uris.slice(i, i + BATCH_CHUNK_SIZE)
    const placeholders = chunk.map(() => '?').join(', ')

    await execute_duckdb_run({
      query: `DELETE FROM entity_relations WHERE source_base_uri IN (${placeholders})`,
      parameters: chunk
    })
  }

  // Flatten all relation tuples for batch insert
  const all_relation_tuples = []
  for (const { source_base_uri, relations } of entity_relations) {
    if (relations && relations.length > 0) {
      for (const relation of relations) {
        if (relation.target_base_uri) {
          all_relation_tuples.push([
            source_base_uri,
            relation.target_base_uri,
            relation.relation_type || 'unknown',
            relation.context || null
          ])
        }
      }
    }
  }

  // Batch insert all relations
  for (let i = 0; i < all_relation_tuples.length; i += BATCH_CHUNK_SIZE) {
    const chunk = all_relation_tuples.slice(i, i + BATCH_CHUNK_SIZE)
    const placeholders = chunk.map(() => '(?, ?, ?, ?)').join(', ')
    const parameters = chunk.flat()

    await execute_duckdb_run({
      query: `INSERT INTO entity_relations (source_base_uri, target_base_uri, relation_type, context)
              VALUES ${placeholders}
              ON CONFLICT DO UPDATE SET context = excluded.context`,
      parameters
    })
  }

  log(
    'Batch synced %d relations for %d entities',
    all_relation_tuples.length,
    source_base_uris.length
  )
}
