/**
 * Entity Data Extractor
 *
 * Extract indexable data from entity properties for database sync.
 */

import debug from 'debug'

import { parse_relation_entry } from '#libs-server/entity/format/extractors/relation-extractor.mjs'

const log = debug('embedded-index:sync:entity')

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

  for (const relation_entry of relations) {
    const parsed = parse_relation_entry(relation_entry)
    if (parsed) {
      parsed_relations.push({
        relation_type: parsed.relation_type,
        target_base_uri: parsed.base_uri,
        context: parsed.context
      })
    }
  }

  return parsed_relations
}

export function extract_content_wikilinks_from_entity_metadata({
  formatted_entity_metadata
}) {
  const references = formatted_entity_metadata?.references
  if (!Array.isArray(references)) return []
  return references
    .map((ref) => ref?.base_uri)
    .filter((base_uri) => typeof base_uri === 'string' && base_uri.length > 0)
}

export function extract_aliases_from_entity({ entity_properties }) {
  if (!entity_properties || !Array.isArray(entity_properties.aliases)) {
    return []
  }
  return entity_properties.aliases.filter(
    (alias) => typeof alias === 'string' && alias.length > 0
  )
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
