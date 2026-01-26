/**
 * Find duplicate tags in a list of tag objects
 *
 * @param {Object} params - Parameters
 * @param {Array} params.tags - Array of tag objects with base_uri property
 * @returns {Array} - Array of duplicate tag URIs (empty if no duplicates)
 */
export function find_duplicate_tags({ tags }) {
  const tag_uris = tags.map((tag) => tag.base_uri)
  const seen_tags = new Set()
  const duplicate_tags = []

  for (const uri of tag_uris) {
    if (seen_tags.has(uri)) {
      duplicate_tags.push(uri)
    } else {
      seen_tags.add(uri)
    }
  }

  return duplicate_tags
}
