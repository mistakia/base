/**
 * Kuzu Thread Sync
 *
 * Functions for syncing threads and file references to Kuzu graph database.
 * Threads are treated as entities with type 'thread'.
 * File/directory references are stored as pseudo-entities with type 'file' or 'directory'.
 */

import debug from 'debug'
import { resolve_base_uri } from '#libs-server/base-uri/base-uri-utilities.mjs'
import { read_file_from_filesystem } from '#libs-server/filesystem/read-file-from-filesystem.mjs'
import { format_entity_from_file_content } from '#libs-server/entity/format/format-entity-from-file-content.mjs'

const log = debug('embedded-index:kuzu:thread-sync')

/**
 * Attempt to fetch entity metadata from filesystem using base_uri
 * Returns entity properties if found, null otherwise
 * @param {string} base_uri - The base URI to resolve
 * @returns {Promise<Object|null>} - Entity properties or null
 */
async function fetch_entity_metadata(base_uri) {
  try {
    const absolute_path = resolve_base_uri(base_uri)
    const file_content = await read_file_from_filesystem({ absolute_path })
    const { entity_properties } = format_entity_from_file_content({
      file_content,
      file_path: absolute_path
    })
    return entity_properties
  } catch (error) {
    log('Could not fetch metadata for %s: %s', base_uri, error.message)
    return null
  }
}

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
      // Ensure target entity node exists with metadata if available
      const entity_props = await fetch_entity_metadata(target_base_uri)

      if (entity_props) {
        // Full upsert with metadata
        const upsert_query = `
          MERGE (e:Entity {base_uri: $target_base_uri})
          SET e.entity_id = $entity_id,
              e.type = $type,
              e.title = $title,
              e.user_public_key = $user_public_key,
              e.created_at = $created_at,
              e.updated_at = $updated_at
        `
        await execute_parameterized_query(connection, upsert_query, {
          target_base_uri,
          entity_id: entity_props.entity_id || '',
          type: entity_props.type || '',
          title: entity_props.title || '',
          user_public_key: entity_props.user_public_key || '',
          created_at: entity_props.created_at || '',
          updated_at: entity_props.updated_at || ''
        })
        log('Upserted target entity with metadata: %s', target_base_uri)
      } else {
        // Minimal node if entity file not found
        const ensure_target_query = `
          MERGE (e:Entity {base_uri: $target_base_uri})
        `
        await execute_parameterized_query(connection, ensure_target_query, {
          target_base_uri
        })
        log('Created minimal target entity node: %s', target_base_uri)
      }

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
 * Uses standard base_uri format (user: or sys:) with entity_type 'file' or 'directory'
 */
export async function upsert_file_reference_to_kuzu({
  connection,
  base_uri,
  file_type = 'file'
}) {
  if (!base_uri) {
    log('Cannot upsert file reference without base_uri')
    return
  }

  const entity_type = file_type === 'directory' ? 'directory' : 'file'

  // Extract filename/dirname for title from base_uri path
  const path_part = base_uri.includes(':') ? base_uri.split(':')[1] : base_uri
  const path_parts = path_part.split('/')
  const title = path_parts[path_parts.length - 1] || base_uri

  log('Upserting file reference to Kuzu: %s', base_uri)

  const query = `
    MERGE (e:Entity {base_uri: $base_uri})
    SET e.type = $type,
        e.title = $title
  `

  try {
    await execute_parameterized_query(connection, query, {
      base_uri,
      type: entity_type,
      title
    })
    log('File reference upserted: %s', base_uri)
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
  for (const file_base_uri of file_references) {
    try {
      await upsert_file_reference_to_kuzu({
        connection,
        base_uri: file_base_uri,
        file_type: 'file'
      })

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
      log('Error syncing file reference %s: %s', file_base_uri, error.message)
    }
  }

  // Create directory reference entities and relations
  for (const dir_base_uri of directory_references) {
    try {
      await upsert_file_reference_to_kuzu({
        connection,
        base_uri: dir_base_uri,
        file_type: 'directory'
      })

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
      log(
        'Error syncing directory reference %s: %s',
        dir_base_uri,
        error.message
      )
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
