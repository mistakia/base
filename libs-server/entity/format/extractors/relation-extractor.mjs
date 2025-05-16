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
      // Parse relation string in format: "relation_type [[entity_path]] (optional context)"
      const relation_match = relation_str.match(
        /^(.*?) \[\[(.*?)\]\]( \((.*?)\))?$/
      )

      if (relation_match) {
        relations.push({
          relation_type: relation_match[1],
          entity_path: relation_match[2],
          context: relation_match[4] || null
        })
      }
    })
  }

  return relations
}
