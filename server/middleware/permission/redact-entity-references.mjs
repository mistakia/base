/**
 * Permission-aware redaction for entity references (tags, relations).
 *
 * Collects all unique URIs from entity tags and relations, batch-checks
 * permissions once, then applies redaction synchronously using the results.
 * This avoids per-item async permission checks and leverages the chunked
 * parallelism of check_permissions_batch.
 */

import debug from 'debug'

import { parse_relation_string } from '#libs-shared/relation-parser.mjs'
import {
  redact_base_uri,
  redact_entity_object,
  redact_thread_data,
  DEFAULT_REDACTED_STRING
} from '#server/middleware/content-redactor.mjs'
import { check_permissions_batch } from '#server/middleware/permission/index.mjs'

const log = debug('permission:redact-references')

/**
 * Collect all unique base_uris referenced by tags and relations across entities.
 *
 * @param {Array} entities - Array of entity objects
 * @returns {Set<string>} Unique base_uris from tags and relations
 */
function collect_reference_uris(entities) {
  const uris = new Set()

  for (const entity of entities) {
    // Top-level tags
    if (entity.tags && Array.isArray(entity.tags)) {
      for (const tag of entity.tags) {
        if (tag && typeof tag === 'string') uris.add(tag)
      }
    }

    // Top-level relations
    if (entity.relations && Array.isArray(entity.relations)) {
      for (const relation_string of entity.relations) {
        const parsed = parse_relation_string({ relation_string })
        if (parsed?.base_uri) uris.add(parsed.base_uri)
      }
    }

    // Frontmatter tags/relations (often duplicates of top-level, handled by Set)
    if (entity.frontmatter && typeof entity.frontmatter === 'object') {
      if (entity.frontmatter.tags && Array.isArray(entity.frontmatter.tags)) {
        for (const tag of entity.frontmatter.tags) {
          if (tag && typeof tag === 'string') uris.add(tag)
        }
      }
      if (
        entity.frontmatter.relations &&
        Array.isArray(entity.frontmatter.relations)
      ) {
        for (const relation_string of entity.frontmatter.relations) {
          const parsed = parse_relation_string({ relation_string })
          if (parsed?.base_uri) uris.add(parsed.base_uri)
        }
      }
    }
  }

  return uris
}

/**
 * Redact a single tag URI using pre-computed permission results.
 */
function redact_tag(tag_uri, permissions) {
  if (!tag_uri || typeof tag_uri !== 'string') {
    return DEFAULT_REDACTED_STRING
  }
  if (permissions[tag_uri]?.read?.allowed) {
    return tag_uri
  }
  return redact_base_uri(tag_uri)
}

/**
 * Redact a single relation string using pre-computed permission results.
 * Preserves relation_type structure while redacting unauthorized base_uris.
 */
function redact_relation(relation_string, permissions) {
  if (!relation_string || typeof relation_string !== 'string') {
    return DEFAULT_REDACTED_STRING
  }

  const parsed = parse_relation_string({ relation_string })
  if (!parsed || !parsed.base_uri) {
    return DEFAULT_REDACTED_STRING
  }

  if (permissions[parsed.base_uri]?.read?.allowed) {
    return relation_string
  }

  const redacted_uri = redact_base_uri(parsed.base_uri)
  let redacted_string = `${parsed.relation_type} [[${redacted_uri}]]`
  if (parsed.context) {
    redacted_string += ` (${'█'.repeat(parsed.context.length)})`
  }
  return redacted_string
}

/**
 * Apply pre-computed permission results to an entity's tags and relations.
 * Works on both top-level and frontmatter fields.
 *
 * @param {Object} entity - Entity object
 * @param {Object} permissions - Map of base_uri -> { read: { allowed } }
 * @returns {Object} Entity with permission-redacted tags/relations
 */
function apply_reference_permissions(entity, permissions) {
  const result = { ...entity }

  // Top-level tags
  if (result.tags && Array.isArray(result.tags)) {
    result.tags = result.tags.map((tag) => redact_tag(tag, permissions))
  }

  // Rebuild tags_aggregated from permission-checked tags
  if (result.tags_aggregated && typeof result.tags_aggregated === 'string') {
    if (result.tags && Array.isArray(result.tags)) {
      result.tags_aggregated = result.tags.join('||')
    }
  }

  // Top-level relations
  if (result.relations && Array.isArray(result.relations)) {
    result.relations = result.relations.map((rel) =>
      redact_relation(rel, permissions)
    )
  }

  // Frontmatter
  if (result.frontmatter && typeof result.frontmatter === 'object') {
    let frontmatter = result.frontmatter

    if (frontmatter.tags && Array.isArray(frontmatter.tags)) {
      frontmatter = {
        ...frontmatter,
        tags: frontmatter.tags.map((tag) => redact_tag(tag, permissions))
      }
    }

    if (frontmatter.relations && Array.isArray(frontmatter.relations)) {
      frontmatter = {
        ...frontmatter,
        relations: frontmatter.relations.map((rel) =>
          redact_relation(rel, permissions)
        )
      }
    }

    result.frontmatter = frontmatter
  }

  return result
}

/**
 * Apply permission-based redaction to a list of entities.
 *
 * Performance: collects all entity base_uris + tag/relation reference URIs,
 * batch-checks permissions once, then applies results synchronously.
 *
 * Entities the user cannot read are fully redacted via redact_entity_object.
 * For readable entities, individual tags and relations are permission-checked
 * and unauthorized references are redacted while preserving structure.
 *
 * @param {Object} params
 * @param {Array} params.entities - Array of entity objects from DuckDB
 * @param {string|null} params.user_public_key - User's public key or null
 * @returns {Promise<Array>} Entities with permission-based redaction applied
 */
/**
 * Apply batch permission checking and redaction to a threads list.
 * Threads the user cannot read are returned with redacted content.
 *
 * @param {Object} params
 * @param {Array} params.threads - Array of thread objects
 * @param {string|null} params.user_public_key - User's public key or null
 * @returns {Promise<Array>} Threads with permission-based redaction applied
 */
export async function filter_threads_by_permission({
  threads,
  user_public_key
}) {
  if (!threads || threads.length === 0) return []

  const resource_paths = threads.map(
    (thread) => `user:thread/${thread.thread_id}`
  )
  let permissions = {}
  if (resource_paths.length > 0) {
    try {
      permissions = await check_permissions_batch({
        user_public_key,
        resource_paths
      })
    } catch {
      // Default deny on batch permission error
    }
  }

  return threads.map((thread) => {
    const base_uri = `user:thread/${thread.thread_id}`
    const read_allowed = permissions[base_uri]?.read?.allowed ?? false
    if (!read_allowed) {
      return { ...redact_thread_data(thread), can_write: false }
    }
    return thread
  })
}

/**
 * Apply permission-based redaction to a list of entities.
 *
 * Performance: collects all entity base_uris + tag/relation reference URIs,
 * batch-checks permissions once, then applies results synchronously.
 *
 * Entities the user cannot read are fully redacted via redact_entity_object.
 * For readable entities, individual tags and relations are permission-checked
 * and unauthorized references are redacted while preserving structure.
 *
 * @param {Object} params
 * @param {Array} params.entities - Array of entity objects from DuckDB
 * @param {string|null} params.user_public_key - User's public key or null
 * @returns {Promise<Array>} Entities with permission-based redaction applied
 */
export async function filter_entities_by_permission({
  entities,
  user_public_key
}) {
  if (!entities || entities.length === 0) return []

  // Collect all unique URIs: entity base_uris + referenced tag/relation URIs
  const entity_uris = entities
    .map((e) => e.base_uri)
    .filter((uri) => uri && typeof uri === 'string')
  const reference_uris = collect_reference_uris(entities)

  // Combine into one set for a single batch check
  const all_uris = new Set([...entity_uris, ...reference_uris])

  // Batch-check all permissions in one pass (chunked internally)
  let permissions = {}
  if (all_uris.size > 0) {
    try {
      permissions = await check_permissions_batch({
        user_public_key,
        resource_paths: [...all_uris]
      })
    } catch (error) {
      log(`Batch permission check failed (default deny): ${error.message}`)
    }
  }

  // Apply permissions synchronously using pre-computed results
  return entities.map((entity) => {
    if (!entity.base_uri) {
      return redact_entity_object(entity)
    }

    const entity_readable = permissions[entity.base_uri]?.read?.allowed ?? false

    if (entity_readable) {
      return apply_reference_permissions(entity, permissions)
    }

    // Entity not readable - full redaction
    return redact_entity_object(entity)
  })
}
