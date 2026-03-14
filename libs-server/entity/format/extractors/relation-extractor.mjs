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
    entity_properties.relations.forEach((relation_entry) => {
      // Handle object-format relations: { type: "relation_type", target: "base_uri" }
      if (relation_entry && typeof relation_entry === 'object') {
        const { type: relation_type, target } = relation_entry
        if (relation_type && target) {
          relations.push({
            relation_type,
            base_uri: target,
            context: relation_entry.context || null
          })
        } else {
          log(
            'Failed to extract relation from object %o in entity %s - expected { type, target }',
            relation_entry,
            entity_properties.base_uri || entity_properties.title || 'unknown'
          )
        }
        return
      }

      // Parse relation string in format: "relation_type [[base_uri]] (optional context)"
      if (typeof relation_entry !== 'string') {
        log(
          'Skipping non-string, non-object relation %o in entity %s',
          relation_entry,
          entity_properties.base_uri || entity_properties.title || 'unknown'
        )
        return
      }

      const relation_match = relation_entry.match(
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
          relation_entry,
          entity_properties.base_uri || entity_properties.title || 'unknown'
        )
      }
    })
  }

  return relations
}
