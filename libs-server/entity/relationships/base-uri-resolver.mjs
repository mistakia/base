import debug from 'debug'
import { resolve_base_uri } from '#libs-server/base-uri/base-uri-utilities.mjs'
import { format_entity_from_file_content } from '#libs-server/entity/format/format-entity-from-file-content.mjs'
import { parse_relation_entry } from '#libs-server/entity/format/extractors/relation-extractor.mjs'
import { read_file_from_filesystem } from '#libs-server/filesystem/read-file-from-filesystem.mjs'
import { list_entity_files_from_filesystem } from '#libs-server/repository/filesystem/list-entity-files-from-filesystem.mjs'

const log = debug('entity:relationships:base-uri-resolver')

/**
 * Simplified relationship resolver that uses base_uri as the primary identifier.
 * This eliminates the need for complex base_uri → entity_id mapping.
 */

/**
 * Validate that a base_uri exists and points to a valid entity file
 * @param {string} base_uri - The base URI to validate
 * @returns {Promise<boolean>} - True if the base_uri points to a valid entity
 */
export async function validate_base_uri_exists(base_uri) {
  try {
    // Resolve base_uri to filesystem path
    const file_path = resolve_base_uri(base_uri)

    // Read and validate the file content
    const file_content = await read_file_from_filesystem({ file_path })
    const { entity_properties } = format_entity_from_file_content({
      file_content,
      file_path
    })

    // Valid if we can parse entity properties and have a type
    return !!(entity_properties && entity_properties.type)
  } catch (error) {
    log(`Base URI validation failed for ${base_uri}:`, error.message)
    return false
  }
}

/**
 * Resolve entity relationships using base_uri directly (no entity_id mapping needed)
 * @param {Object} options - Function options
 * @param {Array} options.relations - Array of relation objects from entity frontmatter
 * @returns {Promise<Array>} - Array of resolved relation objects with validated base_uris
 */
export async function resolve_entity_relations({ relations }) {
  if (!relations || !Array.isArray(relations)) {
    return []
  }

  const resolved_relations = []

  for (const relation of relations) {
    try {
      // Validate that the target base_uri exists
      const target_exists = await validate_base_uri_exists(relation.base_uri)

      if (target_exists) {
        resolved_relations.push({
          relation_type: relation.relation_type,
          target_base_uri: relation.base_uri, // Use base_uri directly
          context: relation.context || null
        })
      } else {
        log(`Skipping relation to non-existent base_uri: ${relation.base_uri}`)
      }
    } catch (error) {
      log(`Error resolving relation to ${relation.base_uri}:`, error.message)
    }
  }

  return resolved_relations
}

/**
 * Find all entities that have a relation pointing to the given base_uri
 * This is useful for finding reverse relationships (e.g., find all subtasks of a parent task)
 * @param {Object} options - Function options
 * @param {string} options.target_base_uri - The base_uri to find relations to
 * @param {string} [options.relation_type] - Optional filter by relation type
 * @param {Array<string>} [options.entity_types] - Optional filter by entity types
 * @returns {Promise<Array>} - Array of entities that have relations to the target
 */
export async function find_entities_with_relations_to({
  target_base_uri,
  relation_type = null,
  entity_types = []
}) {
  const matching_entities = []

  try {
    // Use the proper entity listing function to get all entities
    const entity_files = await list_entity_files_from_filesystem({
      include_entity_types: entity_types.length > 0 ? entity_types : undefined
    })

    for (const entity_file of entity_files) {
      try {
        const { entity_properties } = entity_file

        // Skip if this entity doesn't have relations
        if (
          !entity_properties.relations ||
          entity_properties.relations.length === 0
        ) {
          continue
        }

        // Check each relation to see if it points to our target base_uri
        for (const relation_entry of entity_properties.relations) {
          const parsed = parse_relation_entry(relation_entry)

          if (parsed) {
            if (parsed.base_uri === target_base_uri) {
              // Check if we need to filter by relation type
              if (!relation_type || parsed.relation_type === relation_type) {
                matching_entities.push({
                  base_uri: entity_properties.base_uri,
                  entity_type: entity_properties.type,
                  entity_title:
                    entity_properties.title || entity_properties.name,
                  relation_type: parsed.relation_type,
                  relation_context: parsed.context
                })
              }
            }
          } else {
            log(
              'Malformed relation in %s: %o - expected format: "relation_type [[base_uri]]" or { type, target }',
              entity_properties.base_uri,
              relation_entry
            )
          }
        }
      } catch (error) {
        log('Error processing entity file:', error.message)
      }
    }
  } catch (error) {
    log('Error finding entities with relations:', error.message)
  }

  return matching_entities
}

/**
 * Get all relations for a specific entity using its base_uri
 * @param {Object} options - Function options
 * @param {string} options.base_uri - The base_uri of the entity to get relations for
 * @returns {Promise<Array>} - Array of resolved relations
 */
export async function get_entity_relations({ base_uri }) {
  try {
    // Read the entity file
    const file_path = resolve_base_uri(base_uri)
    const file_content = await read_file_from_filesystem({ file_path })
    const { entity_properties } = format_entity_from_file_content({
      file_content,
      file_path
    })

    // Parse relations from frontmatter
    const relations = []
    if (
      entity_properties.relations &&
      Array.isArray(entity_properties.relations)
    ) {
      entity_properties.relations.forEach((relation_entry) => {
        const parsed = parse_relation_entry(relation_entry)
        if (parsed) {
          relations.push(parsed)
        }
      })
    }

    // Resolve the relations (validate target base_uris exist)
    return await resolve_entity_relations({ relations })
  } catch (error) {
    log(`Error getting relations for ${base_uri}:`, error.message)
    return []
  }
}

/**
 * Build a relation index for efficient lookups using base_uri as keys
 * @param {Object} options - Function options
 * @param {Array<string>} [options.entity_types] - Optional filter by entity types
 * @returns {Promise<Object>} - Relation index with base_uri mappings
 */
export async function build_relation_index({ entity_types = [] } = {}) {
  const relation_index = {
    // base_uri -> Array of outgoing relations
    outgoing_relations: new Map(),
    // base_uri -> Array of incoming relations
    incoming_relations: new Map(),
    // relation_type -> Array of relations of that type
    relations_by_type: new Map()
  }

  try {
    const entity_files = await list_entity_files_from_filesystem({
      include_entity_types: entity_types.length > 0 ? entity_types : undefined
    })

    for (const entity_file of entity_files) {
      try {
        const { entity_properties } = entity_file
        const source_base_uri = entity_properties.base_uri

        if (!source_base_uri) continue

        // Process outgoing relations
        if (
          entity_properties.relations &&
          entity_properties.relations.length > 0
        ) {
          const relations = []

          // Parse relations from frontmatter
          entity_properties.relations.forEach((relation_entry) => {
            const parsed = parse_relation_entry(relation_entry)
            if (parsed) {
              relations.push(parsed)
            }
          })

          const resolved_relations = await resolve_entity_relations({
            relations
          })

          // Store outgoing relations
          relation_index.outgoing_relations.set(
            source_base_uri,
            resolved_relations
          )

          // Build incoming relations and type index
          for (const relation of resolved_relations) {
            // Add to incoming relations
            if (
              !relation_index.incoming_relations.has(relation.target_base_uri)
            ) {
              relation_index.incoming_relations.set(
                relation.target_base_uri,
                []
              )
            }
            relation_index.incoming_relations
              .get(relation.target_base_uri)
              .push({
                source_base_uri,
                relation_type: relation.relation_type,
                context: relation.context
              })

            // Add to type index
            if (!relation_index.relations_by_type.has(relation.relation_type)) {
              relation_index.relations_by_type.set(relation.relation_type, [])
            }
            relation_index.relations_by_type.get(relation.relation_type).push({
              source_base_uri,
              target_base_uri: relation.target_base_uri,
              context: relation.context
            })
          }
        }
      } catch (error) {
        log('Error indexing entity:', error.message)
      }
    }

    log(
      `Built relation index: ${relation_index.outgoing_relations.size} entities`
    )
    return relation_index
  } catch (error) {
    log('Error building relation index:', error.message)
    throw error
  }
}

export default {
  validate_base_uri_exists,
  resolve_entity_relations,
  find_entities_with_relations_to,
  get_entity_relations,
  build_relation_index
}
