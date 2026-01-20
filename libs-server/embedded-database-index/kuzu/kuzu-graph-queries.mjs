/**
 * Kuzu Graph Queries
 *
 * Graph traversal and lookup queries for the entity index.
 */

import debug from 'debug'
import { execute_parameterized_query } from './kuzu-utils.mjs'

const log = debug('embedded-index:kuzu:queries')

export async function find_entities_by_tag({ connection, tag_base_uri }) {
  if (!tag_base_uri) {
    return []
  }

  log('Finding entities by tag: %s', tag_base_uri)

  const query = `
    MATCH (e:Entity)-[:HAS_TAG]->(t:Tag {base_uri: $tag_base_uri})
    RETURN e.base_uri AS base_uri,
           e.entity_id AS entity_id,
           e.type AS type,
           e.title AS title,
           e.user_public_key AS user_public_key
  `

  try {
    const result = await execute_parameterized_query({
      connection,
      query,
      params: { tag_base_uri }
    })
    const entities = await result.getAll()

    log('Found %d entities with tag %s', entities.length, tag_base_uri)
    return entities.map((row) => ({
      base_uri: row.base_uri,
      entity_id: row.entity_id,
      type: row.type,
      title: row.title,
      user_public_key: row.user_public_key
    }))
  } catch (error) {
    log('Error finding entities by tag: %s', error.message)
    throw error
  }
}

export async function find_entities_by_tags({
  connection,
  tag_base_uris,
  match_all = false
}) {
  if (!tag_base_uris || tag_base_uris.length === 0) {
    return []
  }

  log(
    'Finding entities by %d tags (match_all: %s)',
    tag_base_uris.length,
    match_all
  )

  if (match_all) {
    // Entity must have ALL tags
    const tag_conditions = tag_base_uris
      .map((_, i) => `(e)-[:HAS_TAG]->(:Tag {base_uri: $tag_${i}})`)
      .join(' AND ')

    const query = `
      MATCH (e:Entity)
      WHERE ${tag_conditions}
      RETURN DISTINCT e.base_uri AS base_uri,
             e.entity_id AS entity_id,
             e.type AS type,
             e.title AS title,
             e.user_public_key AS user_public_key
    `

    const params = {}
    tag_base_uris.forEach((uri, i) => {
      params[`tag_${i}`] = uri
    })

    try {
      const result = await execute_parameterized_query({
        connection,
        query,
        params
      })
      const entities = await result.getAll()

      return entities.map((row) => ({
        base_uri: row.base_uri,
        entity_id: row.entity_id,
        type: row.type,
        title: row.title,
        user_public_key: row.user_public_key
      }))
    } catch (error) {
      log('Error finding entities by tags (match_all): %s', error.message)
      throw error
    }
  } else {
    // Entity must have ANY of the tags
    // Kuzu doesn't support array parameters, so we build individual OR conditions
    const tag_conditions = tag_base_uris
      .map((_, i) => `t.base_uri = $tag_${i}`)
      .join(' OR ')

    const query = `
      MATCH (e:Entity)-[:HAS_TAG]->(t:Tag)
      WHERE ${tag_conditions}
      RETURN DISTINCT e.base_uri AS base_uri,
             e.entity_id AS entity_id,
             e.type AS type,
             e.title AS title,
             e.user_public_key AS user_public_key
    `

    const params = {}
    tag_base_uris.forEach((uri, i) => {
      params[`tag_${i}`] = uri
    })

    try {
      const result = await execute_parameterized_query({
        connection,
        query,
        params
      })
      const entities = await result.getAll()

      return entities.map((row) => ({
        base_uri: row.base_uri,
        entity_id: row.entity_id,
        type: row.type,
        title: row.title,
        user_public_key: row.user_public_key
      }))
    } catch (error) {
      log('Error finding entities by tags: %s', error.message)
      throw error
    }
  }
}

export async function find_related_entities({
  connection,
  base_uri,
  relation_type = null,
  entity_type = null,
  limit = 100,
  offset = 0
}) {
  if (!base_uri) {
    return []
  }

  log(
    'Finding entities related from: %s (relation_type: %s, entity_type: %s)',
    base_uri,
    relation_type,
    entity_type
  )

  // Ensure limit and offset are valid integers (KuzuDB requires literal values for SKIP/LIMIT)
  const limit_int = Math.max(0, Math.floor(Number(limit) || 100))
  const offset_int = Math.max(0, Math.floor(Number(offset) || 0))

  const params = { base_uri }
  const where_clauses = []

  if (relation_type) {
    where_clauses.push('r.relation_type = $relation_type')
    params.relation_type = relation_type
  }

  if (entity_type) {
    // Explicitly check for non-NULL type to avoid Kuzu NULL comparison issues
    where_clauses.push('target.type IS NOT NULL AND target.type = $entity_type')
    params.entity_type = entity_type
  }

  const where_clause =
    where_clauses.length > 0 ? `WHERE ${where_clauses.join(' AND ')}` : ''

  const query = `
    MATCH (source:Entity {base_uri: $base_uri})-[r:RELATES_TO]->(target:Entity)
    ${where_clause}
    RETURN target.base_uri AS base_uri,
           target.entity_id AS entity_id,
           target.type AS type,
           target.title AS title,
           r.relation_type AS relation_type,
           r.context AS context
    SKIP ${offset_int}
    LIMIT ${limit_int}
  `

  try {
    const result = await execute_parameterized_query({ connection, query, params })
    const entities = await result.getAll()

    log('Found %d related entities', entities.length)
    return entities.map((row) => ({
      base_uri: row.base_uri,
      entity_id: row.entity_id,
      type: row.type,
      title: row.title,
      relation_type: row.relation_type,
      context: row.context
    }))
  } catch (error) {
    log('Error finding related entities: %s', error.message)
    throw error
  }
}

export async function find_entities_relating_to({
  connection,
  base_uri,
  relation_type = null,
  entity_type = null,
  limit = 100,
  offset = 0
}) {
  if (!base_uri) {
    return []
  }

  log(
    'Finding entities relating to: %s (relation_type: %s, entity_type: %s)',
    base_uri,
    relation_type,
    entity_type
  )

  // Ensure limit and offset are valid integers (KuzuDB requires literal values for SKIP/LIMIT)
  const limit_int = Math.max(0, Math.floor(Number(limit) || 100))
  const offset_int = Math.max(0, Math.floor(Number(offset) || 0))

  const params = { base_uri }
  const where_clauses = []

  if (relation_type) {
    where_clauses.push('r.relation_type = $relation_type')
    params.relation_type = relation_type
  }

  if (entity_type) {
    where_clauses.push('source.type = $entity_type')
    params.entity_type = entity_type
  }

  const where_clause =
    where_clauses.length > 0 ? `WHERE ${where_clauses.join(' AND ')}` : ''

  const query = `
    MATCH (source:Entity)-[r:RELATES_TO]->(target:Entity {base_uri: $base_uri})
    ${where_clause}
    RETURN source.base_uri AS base_uri,
           source.entity_id AS entity_id,
           source.type AS type,
           source.title AS title,
           r.relation_type AS relation_type,
           r.context AS context
    SKIP ${offset_int}
    LIMIT ${limit_int}
  `

  try {
    const result = await execute_parameterized_query({ connection, query, params })
    const entities = await result.getAll()

    log('Found %d entities relating to target', entities.length)
    return entities.map((row) => ({
      base_uri: row.base_uri,
      entity_id: row.entity_id,
      type: row.type,
      title: row.title,
      relation_type: row.relation_type,
      context: row.context
    }))
  } catch (error) {
    log('Error finding entities relating to: %s', error.message)
    throw error
  }
}

export async function get_entity_graph({ connection, base_uri, depth = 1 }) {
  if (!base_uri) {
    return { nodes: [], edges: [] }
  }

  log('Getting entity graph for: %s (depth: %d)', base_uri, depth)

  // Get the central entity and its neighbors up to specified depth
  const query = `
    MATCH path = (start:Entity {base_uri: $base_uri})-[r:RELATES_TO|HAS_TAG*1..${depth}]-(connected)
    RETURN start, r, connected
  `

  try {
    const result = await execute_parameterized_query({
      connection,
      query,
      params: { base_uri }
    })
    const rows = await result.getAll()
    const nodes = new Map()
    const edges = []

    // Add the starting node
    nodes.set(base_uri, { base_uri, type: 'entity' })

    for (const row of rows) {
      const connected = row.connected

      if (connected && connected.base_uri) {
        nodes.set(connected.base_uri, {
          base_uri: connected.base_uri,
          title: connected.title,
          type: connected.type || 'tag'
        })
      }

      // Note: Edge extraction depends on Kuzu's result format
      // This is a simplified version
    }

    return {
      nodes: Array.from(nodes.values()),
      edges
    }
  } catch (error) {
    log('Error getting entity graph: %s', error.message)
    throw error
  }
}
