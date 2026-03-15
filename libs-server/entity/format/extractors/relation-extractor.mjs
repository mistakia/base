import debug from 'debug'

const log = debug('entity:format:extractors:relation-extractor')

/**
 * Parse a single relation entry (string or object format) into a normalized object.
 * Handles both string format ("relation_type [[base_uri]] (optional context)")
 * and object format ({ type: "relation_type", target: "base_uri", context: "..." }).
 *
 * @param {string|Object} relation_entry - The relation entry to parse
 * @returns {Object|null} Parsed relation { relation_type, base_uri, context } or null if invalid
 */
export function parse_relation_entry(relation_entry) {
  // Handle object-format relations: { type: "relation_type", target: "base_uri" }
  if (relation_entry && typeof relation_entry === 'object') {
    const { type: relation_type, target } = relation_entry
    if (relation_type && target) {
      return {
        relation_type,
        base_uri: target,
        context: relation_entry.context || null
      }
    }
    return null
  }

  // Handle string-format relations
  if (typeof relation_entry !== 'string') {
    return null
  }

  const relation_match = relation_entry.match(
    /^(.*?) \[\[(.*?)\]\]( \((.*?)\))?$/
  )

  if (relation_match) {
    return {
      relation_type: relation_match[1],
      base_uri: relation_match[2],
      context: relation_match[4] || null
    }
  }

  return null
}

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
      const parsed = parse_relation_entry(relation_entry)

      if (parsed) {
        relations.push(parsed)
      } else if (relation_entry && typeof relation_entry === 'object') {
        log(
          'Failed to extract relation from object %o in entity %s - expected { type, target }',
          relation_entry,
          entity_properties.base_uri || entity_properties.title || 'unknown'
        )
      } else if (typeof relation_entry === 'string') {
        log(
          'Failed to extract relation from "%s" in entity %s - expected format: "relation_type [[base_uri]]"',
          relation_entry,
          entity_properties.base_uri || entity_properties.title || 'unknown'
        )
      } else {
        log(
          'Skipping non-string, non-object relation %o in entity %s',
          relation_entry,
          entity_properties.base_uri || entity_properties.title || 'unknown'
        )
      }
    })
  }

  return relations
}
