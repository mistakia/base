/**
 * Extract references (wikilinks) from markdown content
 * @param {Object} parsed_markdown Parsed markdown entity
 * @returns {Array} Extracted entity references
 */
export function extract_entity_references(parsed_markdown) {
  const references = []
  const markdown = parsed_markdown.markdown || ''
  const wikilink_regex = /\[\[([^\]]+)\]\]/g
  let match

  while ((match = wikilink_regex.exec(markdown)) !== null) {
    references.push({
      reference_path: match[1]
    })
  }

  return references
}
