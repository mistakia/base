/**
 * Extract relations from markdown frontmatter
 * @param {Object} parsed_markdown Parsed markdown entity
 * @returns {Array} Extracted entity relations
 */
export function extract_entity_relations(parsed_markdown) {
  const relations = []
  const frontmatter = parsed_markdown.frontmatter || {}

  // Extract relations from frontmatter
  if (frontmatter.relations && Array.isArray(frontmatter.relations)) {
    frontmatter.relations.forEach((relation_str) => {
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
