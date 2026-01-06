/**
 * Kuzu Entity Sync
 *
 * Functions for syncing entities, tags, and relations to Kuzu graph database.
 */

import debug from 'debug'
import { resolve_base_uri } from '#libs-server/base-uri/base-uri-utilities.mjs'
import { read_file_from_filesystem } from '#libs-server/filesystem/read-file-from-filesystem.mjs'
import { format_entity_from_file_content } from '#libs-server/entity/format/format-entity-from-file-content.mjs'

const log = debug('embedded-index:kuzu:sync')

/**
 * Attempt to fetch entity metadata from filesystem using base_uri
 * Returns entity_data suitable for upsert, or minimal data if lookup fails
 * @param {string} base_uri - The base URI to resolve
 * @returns {Promise<Object>} - Entity data with metadata if found
 */
async function fetch_entity_metadata_from_filesystem(base_uri) {
  try {
    const absolute_path = resolve_base_uri(base_uri)
    const file_content = await read_file_from_filesystem({ absolute_path })
    const { entity_properties } = format_entity_from_file_content({
      file_content,
      file_path: absolute_path
    })

    if (entity_properties) {
      log('Fetched metadata for relation target: %s', base_uri)
      return {
        base_uri,
        entity_id: entity_properties.entity_id,
        type: entity_properties.type,
        title: entity_properties.title,
        user_public_key: entity_properties.user_public_key,
        created_at: entity_properties.created_at,
        updated_at: entity_properties.updated_at
      }
    }
  } catch (error) {
    log('Could not fetch metadata for %s: %s', base_uri, error.message)
  }

  // Return minimal data if lookup fails
  return { base_uri }
}

/**
 * Helper to execute parameterized Kuzu queries
 * Uses prepare + execute pattern required by Kuzu node library
 */
async function execute_parameterized_query(connection, query, params) {
  const prepared_statement = await connection.prepare(query)
  return await connection.execute(prepared_statement, params)
}

export async function upsert_entity_to_kuzu({ connection, entity_data }) {
  const {
    base_uri,
    entity_id,
    type,
    title,
    user_public_key,
    created_at,
    updated_at
  } = entity_data

  if (!base_uri) {
    log('Cannot upsert entity without base_uri')
    return
  }

  log('Upserting entity to Kuzu: %s', base_uri)

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
      base_uri: base_uri || '',
      entity_id: entity_id || '',
      type: type || '',
      title: title || '',
      user_public_key: user_public_key || '',
      created_at: created_at || '',
      updated_at: updated_at || ''
    })
    log('Entity upserted: %s', base_uri)
  } catch (error) {
    log('Error upserting entity: %s', error.message)
    throw error
  }
}

export async function upsert_tag_to_kuzu({ connection, tag_data }) {
  const { base_uri, title } = tag_data

  if (!base_uri) {
    log('Cannot upsert tag without base_uri')
    return
  }

  log('Upserting tag to Kuzu: %s', base_uri)

  const query = `
    MERGE (t:Tag {base_uri: $base_uri})
    SET t.title = $title
  `

  try {
    await execute_parameterized_query(connection, query, {
      base_uri: base_uri || '',
      title: title || ''
    })
    log('Tag upserted: %s', base_uri)
  } catch (error) {
    log('Error upserting tag: %s', error.message)
    throw error
  }
}

export async function sync_entity_tags_to_kuzu({
  connection,
  entity_base_uri,
  tag_base_uris
}) {
  if (!entity_base_uri || !tag_base_uris) {
    return
  }

  log('Syncing %d tags for entity: %s', tag_base_uris.length, entity_base_uri)

  // Delete existing HAS_TAG relationships for this entity
  try {
    const delete_query = `
      MATCH (e:Entity {base_uri: $entity_base_uri})-[r:HAS_TAG]->()
      DELETE r
    `
    await execute_parameterized_query(connection, delete_query, {
      entity_base_uri
    })
  } catch (error) {
    log('Error deleting existing tags: %s', error.message)
  }

  // Create new HAS_TAG relationships
  for (const tag_base_uri of tag_base_uris) {
    try {
      // Ensure tag node exists
      await upsert_tag_to_kuzu({
        connection,
        tag_data: { base_uri: tag_base_uri, title: '' }
      })

      // Create relationship
      const create_query = `
        MATCH (e:Entity {base_uri: $entity_base_uri})
        MATCH (t:Tag {base_uri: $tag_base_uri})
        CREATE (e)-[:HAS_TAG]->(t)
      `
      await execute_parameterized_query(connection, create_query, {
        entity_base_uri,
        tag_base_uri
      })
    } catch (error) {
      log('Error creating HAS_TAG relationship: %s', error.message)
    }
  }
}

export async function sync_entity_relations_to_kuzu({
  connection,
  entity_base_uri,
  relations
}) {
  if (!entity_base_uri || !relations) {
    return
  }

  log('Syncing %d relations for entity: %s', relations.length, entity_base_uri)

  // Delete existing RELATES_TO relationships from this entity
  try {
    const delete_query = `
      MATCH (e:Entity {base_uri: $entity_base_uri})-[r:RELATES_TO]->()
      DELETE r
    `
    await execute_parameterized_query(connection, delete_query, {
      entity_base_uri
    })
  } catch (error) {
    log('Error deleting existing relations: %s', error.message)
  }

  // Create new RELATES_TO relationships
  for (const relation of relations) {
    const { target_base_uri, relation_type, context } = relation

    if (!target_base_uri) {
      continue
    }

    try {
      // Ensure target entity node exists with metadata if available
      const target_entity_data =
        await fetch_entity_metadata_from_filesystem(target_base_uri)
      await upsert_entity_to_kuzu({
        connection,
        entity_data: target_entity_data
      })

      // Create relationship
      const create_query = `
        MATCH (source:Entity {base_uri: $entity_base_uri})
        MATCH (target:Entity {base_uri: $target_base_uri})
        CREATE (source)-[:RELATES_TO {relation_type: $relation_type, context: $context}]->(target)
      `
      await execute_parameterized_query(connection, create_query, {
        entity_base_uri,
        target_base_uri,
        relation_type: relation_type || '',
        context: context || ''
      })
    } catch (error) {
      log('Error creating RELATES_TO relationship: %s', error.message)
    }
  }
}

export async function delete_entity_from_kuzu({ connection, base_uri }) {
  if (!base_uri) {
    return
  }

  log('Deleting entity from Kuzu: %s', base_uri)

  try {
    // Delete all relationships first
    const delete_rels_query = `
      MATCH (e:Entity {base_uri: $base_uri})-[r]-()
      DELETE r
    `
    await execute_parameterized_query(connection, delete_rels_query, {
      base_uri
    })

    // Delete the entity node
    const delete_entity_query = `
      MATCH (e:Entity {base_uri: $base_uri})
      DELETE e
    `
    await execute_parameterized_query(connection, delete_entity_query, {
      base_uri
    })

    log('Entity deleted: %s', base_uri)
  } catch (error) {
    log('Error deleting entity: %s', error.message)
    throw error
  }
}
