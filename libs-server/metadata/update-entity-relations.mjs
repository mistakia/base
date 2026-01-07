/**
 * Update entity relations with thread back-references
 *
 * Adds reverse relations to entity files when a thread accesses/modifies/creates them.
 */

import debug from 'debug'

import {
  RELATION_ACCESSES,
  RELATION_MODIFIES,
  RELATION_CREATES,
  get_reverse_relation_type
} from '#libs-shared/entity-relations.mjs'
import { resolve_base_uri } from '#libs-server/base-uri/base-uri-utilities.mjs'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/write-entity-to-filesystem.mjs'

const log = debug('metadata:update-entity-relations')

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format a relation string
 * @param {string} relation_type - Relation type
 * @param {string} base_uri - Target base URI
 * @returns {string} Formatted relation string
 */
function format_relation(relation_type, base_uri) {
  return `${relation_type} [[${base_uri}]]`
}

/**
 * Check if a relation already exists in an entity
 * @param {Array} relations - Existing relations array
 * @param {string} relation_type - Relation type to check
 * @param {string} base_uri - Target base URI
 * @returns {boolean} True if relation exists
 */
function relation_exists(relations, relation_type, base_uri) {
  if (!relations || !Array.isArray(relations)) return false

  const target_relation = format_relation(relation_type, base_uri)
  return relations.includes(target_relation)
}

// ============================================================================
// Entity Update Functions
// ============================================================================

/**
 * Add a back-reference relation to a single entity
 * @param {Object} params
 * @param {string} params.entity_base_uri - Base URI of the entity to update
 * @param {string} params.thread_id - Thread ID to add as back-reference
 * @param {string} params.relation_type - Reverse relation type
 * @returns {Promise<Object>} Result { success, updated, skipped, error }
 */
async function add_back_reference_to_entity({
  entity_base_uri,
  thread_id,
  relation_type
}) {
  const thread_base_uri = `user:thread/${thread_id}`

  try {
    // Resolve base URI to file path
    const absolute_path = resolve_base_uri(entity_base_uri)

    // Read entity
    const read_result = await read_entity_from_filesystem({ absolute_path })

    if (!read_result.success) {
      log(`Entity not found: ${entity_base_uri}`)
      return { success: false, skipped: true, reason: 'not_found' }
    }

    const { entity_properties, entity_content } = read_result

    // Check if relation already exists
    const existing_relations = entity_properties.relations || []
    if (relation_exists(existing_relations, relation_type, thread_base_uri)) {
      log(`Relation already exists: ${relation_type} [[${thread_base_uri}]]`)
      return { success: true, skipped: true, reason: 'already_exists' }
    }

    // Add new relation
    const new_relation = format_relation(relation_type, thread_base_uri)
    const updated_relations = [...existing_relations, new_relation]

    // Update entity properties
    const updated_properties = {
      ...entity_properties,
      relations: updated_relations,
      updated_at: new Date().toISOString()
    }

    // Write entity back
    await write_entity_to_filesystem({
      absolute_path,
      entity_properties: updated_properties,
      entity_type: entity_properties.type,
      entity_content
    })

    log(`Added back-reference to ${entity_base_uri}: ${new_relation}`)
    return { success: true, updated: true }
  } catch (error) {
    log(`Error updating entity ${entity_base_uri}: ${error.message}`)
    return { success: false, error: error.message }
  }
}

// ============================================================================
// Main Export
// ============================================================================

/**
 * Add thread back-references to all referenced entities
 *
 * For each entity that the thread accessed/modified/created, adds a reverse
 * relation pointing back to the thread.
 *
 * @param {Object} params
 * @param {Array} params.references - Array of { base_uri, access_type }
 * @param {string} params.thread_id - Thread ID to add as back-reference
 * @returns {Promise<Object>} { updated: [...], skipped: [...], errors: [...] }
 */
export async function add_thread_back_references({ references, thread_id }) {
  if (!references || !Array.isArray(references)) {
    return { updated: [], skipped: [], errors: [] }
  }

  if (!thread_id) {
    throw new Error('thread_id is required')
  }

  const results = {
    updated: [],
    skipped: [],
    errors: []
  }

  for (const ref of references) {
    const { base_uri, access_type } = ref

    // Skip thread references (don't add back-references to threads)
    if (base_uri.startsWith('user:thread/')) {
      continue
    }

    // Map access type to forward relation
    const forward_relation_map = {
      read: RELATION_ACCESSES,
      modify: RELATION_MODIFIES,
      create: RELATION_CREATES
    }

    const forward_type = forward_relation_map[access_type]
    if (!forward_type) {
      log(`Unknown access type: ${access_type}`)
      continue
    }

    // Get reverse relation type
    const reverse_type = get_reverse_relation_type({
      relation_type: forward_type
    })
    if (!reverse_type) {
      log(`No reverse relation for: ${forward_type}`)
      continue
    }

    // Add back-reference to entity
    const result = await add_back_reference_to_entity({
      entity_base_uri: base_uri,
      thread_id,
      relation_type: reverse_type
    })

    if (result.updated) {
      results.updated.push({ base_uri, relation_type: reverse_type })
    } else if (result.skipped) {
      results.skipped.push({ base_uri, reason: result.reason })
    } else if (result.error) {
      results.errors.push({ base_uri, error: result.error })
    }
  }

  log(
    `Back-reference results: ${results.updated.length} updated, ${results.skipped.length} skipped, ${results.errors.length} errors`
  )

  return results
}

export default add_thread_back_references
