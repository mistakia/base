/**
 * Entity Data Extractor
 *
 * Extract indexable data from entity properties for database sync.
 */

import debug from 'debug'

const log = debug('embedded-index:sync:entity')

export function extract_entity_index_data({
  entity_properties,
  file_info = {}
}) {
  if (!entity_properties) {
    return null
  }

  const base_uri = entity_properties.base_uri || file_info.base_uri

  return {
    entity_id: entity_properties.entity_id,
    base_uri,
    type: entity_properties.type,
    title: entity_properties.title,
    user_public_key: entity_properties.user_public_key,
    created_at: entity_properties.created_at,
    updated_at: entity_properties.updated_at
  }
}

export function extract_tags_from_entity({ entity_properties }) {
  if (!entity_properties || !entity_properties.tags) {
    return []
  }

  const tags = entity_properties.tags

  // Tags can be strings (base_uris) directly
  if (Array.isArray(tags)) {
    return tags.filter((tag) => typeof tag === 'string')
  }

  return []
}

export function extract_relations_from_entity({ entity_properties }) {
  if (!entity_properties || !entity_properties.relations) {
    return []
  }

  const relations = entity_properties.relations
  const parsed_relations = []

  if (!Array.isArray(relations)) {
    return []
  }

  for (const relation_string of relations) {
    if (typeof relation_string !== 'string') {
      continue
    }

    const parsed = parse_relation_string(relation_string)
    if (parsed) {
      parsed_relations.push(parsed)
    }
  }

  return parsed_relations
}

function parse_relation_string(relation_string) {
  // Format: "relation_type [[target_base_uri]] (optional_context)"
  // Example: "implements [[sys:system/schema/task.md]]"
  // Example: "relates_to [[user:task/other.md]] (some context)"

  const relation_regex = /^(\S+)\s+\[\[([^\]]+)\]\](?:\s+\(([^)]*)\))?$/

  const match = relation_string.match(relation_regex)

  if (!match) {
    log('Could not parse relation string: %s', relation_string)
    return null
  }

  return {
    relation_type: match[1],
    target_base_uri: match[2],
    context: match[3] || null
  }
}

export function extract_tag_index_data({ entity_properties, file_info = {} }) {
  if (!entity_properties || entity_properties.type !== 'tag') {
    return null
  }

  const base_uri = entity_properties.base_uri || file_info.base_uri

  return {
    base_uri,
    title: entity_properties.title
  }
}

/**
 * Extract data for unified entities table sync
 *
 * @param {Object} params - Parameters
 * @param {Object} params.entity_properties - Entity frontmatter properties
 * @param {Object} [params.file_info] - File metadata
 * @returns {Object|null} Entity data for unified table sync
 */
export function extract_unified_entity_data({
  entity_properties,
  file_info = {}
}) {
  if (!entity_properties) {
    return null
  }

  const base_uri = entity_properties.base_uri || file_info.base_uri
  const entity_id = entity_properties.entity_id
  const type = entity_properties.type

  if (!base_uri || !entity_id || !type) {
    log('Cannot extract entity data without base_uri, entity_id, and type')
    return null
  }

  return {
    base_uri,
    entity_id,
    type,
    frontmatter: entity_properties,
    user_public_key: entity_properties.user_public_key
  }
}
