/**
 * Kuzu Thread Sync
 *
 * Functions for syncing threads and file references to Kuzu graph database.
 * Threads are treated as entities with type 'thread'.
 * File/directory references are stored as pseudo-entities with type 'file' or 'directory'.
 */

import debug from 'debug'

const log = debug('embedded-index:kuzu:thread-sync')

/**
 * Helper to execute parameterized Kuzu queries
 * Uses prepare + execute pattern required by Kuzu node library
 */
async function execute_parameterized_query(connection, query, params) {
  const prepared_statement = await connection.prepare(query)
  return await connection.execute(prepared_statement, params)
}

/**
 * Upsert a thread as an entity node in Kuzu
 * Thread base_uri format: user:thread/<thread-id>
 */
export async function upsert_thread_to_kuzu({ connection, thread_data }) {
  const { thread_id, title, created_at, updated_at, user_public_key } =
    thread_data

  if (!thread_id) {
    log('Cannot upsert thread without thread_id')
    return
  }

  const thread_base_uri = `user:thread/${thread_id}`

  log('Upserting thread to Kuzu: %s', thread_base_uri)

  const query = `
    MERGE (e:Entity {base_uri: $base_uri})
    SET e.entity_id = $entity_id,
        e.type = $type,
        e.title = $title,
        e.user_public_key = $user_public_key,
        e.created_at = $created_at,
        e.updated_at = $updated_at
  `

  try {
    await execute_parameterized_query(connection, query, {
      base_uri: thread_base_uri,
      entity_id: thread_id,
      type: 'thread',
      title: title || '',
      user_public_key: user_public_key || '',
      created_at: created_at || '',
      updated_at: updated_at || ''
    })
    log('Thread upserted: %s', thread_base_uri)
  } catch (error) {
    log('Error upserting thread: %s', error.message)
    throw error
  }
}

/**
 * Sync thread relations to Kuzu
 * Deletes existing relations and creates new ones based on metadata.relations array
 */
export async function sync_thread_relations_to_kuzu({
  connection,
  thread_id,
  relations
}) {
  if (!thread_id) {
    return
  }

  const thread_base_uri = `user:thread/${thread_id}`

  if (!relations || relations.length === 0) {
    log('No relations to sync for thread: %s', thread_id)
    return
  }

  log('Syncing %d relations for thread: %s', relations.length, thread_id)

  // Delete existing RELATES_TO relationships from this thread
  try {
    const delete_query = `
      MATCH (e:Entity {base_uri: $thread_base_uri})-[r:RELATES_TO]->()
      DELETE r
    `
    await execute_parameterized_query(connection, delete_query, {
      thread_base_uri
    })
  } catch (error) {
    log('Error deleting existing thread relations: %s', error.message)
  }

  // Create new RELATES_TO relationships
  for (const relation of relations) {
    const { target_base_uri, relation_type, context } = relation

    if (!target_base_uri) {
      continue
    }

    try {
      // Ensure target entity node exists (minimal node)
      const ensure_target_query = `
        MERGE (e:Entity {base_uri: $target_base_uri})
      `
      await execute_parameterized_query(connection, ensure_target_query, {
        target_base_uri
      })

      // Create relationship
      const create_query = `
        MATCH (source:Entity {base_uri: $thread_base_uri})
        MATCH (target:Entity {base_uri: $target_base_uri})
        CREATE (source)-[:RELATES_TO {relation_type: $relation_type, context: $context}]->(target)
      `
      await execute_parameterized_query(connection, create_query, {
        thread_base_uri,
        target_base_uri,
        relation_type: relation_type || '',
        context: context || ''
      })
    } catch (error) {
      log('Error creating thread RELATES_TO relationship: %s', error.message)
    }
  }
}

/**
 * Upsert a file reference as a pseudo-entity in Kuzu
 * File base_uri format: file:<absolute-path>
 */
export async function upsert_file_reference_to_kuzu({
  connection,
  file_path,
  file_type = 'file'
}) {
  if (!file_path) {
    log('Cannot upsert file reference without file_path')
    return
  }

  const file_base_uri = `file:${file_path}`
  const entity_type = file_type === 'directory' ? 'directory' : 'file'

  // Extract filename/dirname for title
  const path_parts = file_path.split('/')
  const title = path_parts[path_parts.length - 1] || file_path

  log('Upserting file reference to Kuzu: %s', file_base_uri)

  const query = `
    MERGE (e:Entity {base_uri: $base_uri})
    SET e.type = $type,
        e.title = $title
  `

  try {
    await execute_parameterized_query(connection, query, {
      base_uri: file_base_uri,
      type: entity_type,
      title
    })
    log('File reference upserted: %s', file_base_uri)
  } catch (error) {
    log('Error upserting file reference: %s', error.message)
    throw error
  }
}

/**
 * Sync file references from a thread to Kuzu
 * Creates file/directory pseudo-entities and RELATES_TO edges from thread
 */
export async function sync_thread_file_references_to_kuzu({
  connection,
  thread_id,
  file_references = [],
  directory_references = []
}) {
  if (!thread_id) {
    return
  }

  const thread_base_uri = `user:thread/${thread_id}`
  const total_refs = file_references.length + directory_references.length

  if (total_refs === 0) {
    log('No file references to sync for thread: %s', thread_id)
    return
  }

  log('Syncing %d file references for thread: %s', total_refs, thread_id)

  // Delete existing file/directory relations from this thread
  try {
    const delete_query = `
      MATCH (t:Entity {base_uri: $thread_base_uri})-[r:RELATES_TO]->(f:Entity)
      WHERE f.type = 'file' OR f.type = 'directory'
      DELETE r
    `
    await execute_parameterized_query(connection, delete_query, {
      thread_base_uri
    })
  } catch (error) {
    log('Error deleting existing file references: %s', error.message)
  }

  // Create file reference entities and relations
  for (const file_path of file_references) {
    try {
      await upsert_file_reference_to_kuzu({
        connection,
        file_path,
        file_type: 'file'
      })

      const file_base_uri = `file:${file_path}`
      const create_rel_query = `
        MATCH (t:Entity {base_uri: $thread_base_uri})
        MATCH (f:Entity {base_uri: $file_base_uri})
        CREATE (t)-[:RELATES_TO {relation_type: $relation_type, context: $context}]->(f)
      `
      await execute_parameterized_query(connection, create_rel_query, {
        thread_base_uri,
        file_base_uri,
        relation_type: 'references',
        context: ''
      })
    } catch (error) {
      log('Error syncing file reference %s: %s', file_path, error.message)
    }
  }

  // Create directory reference entities and relations
  for (const dir_path of directory_references) {
    try {
      await upsert_file_reference_to_kuzu({
        connection,
        file_path: dir_path,
        file_type: 'directory'
      })

      const dir_base_uri = `file:${dir_path}`
      const create_rel_query = `
        MATCH (t:Entity {base_uri: $thread_base_uri})
        MATCH (d:Entity {base_uri: $dir_base_uri})
        CREATE (t)-[:RELATES_TO {relation_type: $relation_type, context: $context}]->(d)
      `
      await execute_parameterized_query(connection, create_rel_query, {
        thread_base_uri,
        dir_base_uri,
        relation_type: 'references',
        context: ''
      })
    } catch (error) {
      log('Error syncing directory reference %s: %s', dir_path, error.message)
    }
  }
}

/**
 * Delete a thread from Kuzu
 * Removes the thread entity node and all its relationships
 */
export async function delete_thread_from_kuzu({ connection, thread_id }) {
  if (!thread_id) {
    return
  }

  const thread_base_uri = `user:thread/${thread_id}`

  log('Deleting thread from Kuzu: %s', thread_base_uri)

  try {
    // Delete all relationships first
    const delete_rels_query = `
      MATCH (e:Entity {base_uri: $base_uri})-[r]-()
      DELETE r
    `
    await execute_parameterized_query(connection, delete_rels_query, {
      base_uri: thread_base_uri
    })

    // Delete the entity node
    const delete_entity_query = `
      MATCH (e:Entity {base_uri: $base_uri})
      DELETE e
    `
    await execute_parameterized_query(connection, delete_entity_query, {
      base_uri: thread_base_uri
    })

    log('Thread deleted: %s', thread_base_uri)
  } catch (error) {
    log('Error deleting thread: %s', error.message)
    throw error
  }
}
