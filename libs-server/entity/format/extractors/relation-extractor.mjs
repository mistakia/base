import debug from 'debug'

const log = debug('entity:format:extractors:relation-extractor')

/**
 * Extract relations from entity properties
 * @param {Object} options - Function options
 * @param {Object} options.entity_properties - The entity properties
 * @returns {Array} Extracted entity relations
 */
export function extract_entity_relations({ entity_properties }) {
  const relations = []

  // Extract relations from entity properties
  if (
    entity_properties.relations &&
    Array.isArray(entity_properties.relations)
  ) {
    entity_properties.relations.forEach((relation_str) => {
      // Parse relation string in format: "relation_type [[base_uri]] (optional context)"
      const relation_match = relation_str.match(
        /^(.*?) \[\[(.*?)\]\]( \((.*?)\))?$/
      )

      if (relation_match) {
        relations.push({
          relation_type: relation_match[1],
          base_uri: relation_match[2],
          context: relation_match[4] || null
        })
      } else {
        log(
          'Failed to extract relation from "%s" in entity %s - expected format: "relation_type [[base_uri]]"',
          relation_str,
          entity_properties.base_uri || entity_properties.title || 'unknown'
        )
      }
    })
  }

  return relations
}
