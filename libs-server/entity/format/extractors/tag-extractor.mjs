import debug from 'debug'

const log = debug('entity:format:extractors:tag-extractor')

/**
 * Extract tags from entity properties and content
 * @param {Object} options - Function options
 * @param {Object} options.entity_properties - The entity properties
 * @param {string} options.entity_content - The entity content
 * @returns {Array<Object>} Extracted entity tags with base_relative_path in format <system|user>/<tag-path>
 */
export function extract_entity_tags({
  entity_properties = {},
  entity_content = ''
}) {
  const tags = []

  // Extract tags from entity properties
  if (entity_properties.tags && Array.isArray(entity_properties.tags)) {
    entity_properties.tags.forEach((base_relative_path) => {
      if (!base_relative_path.match(/^(system|user)\//)) {
        log(
          `Warning: Invalid base_relative_path format: ${base_relative_path}. Must start with system/ or user/`
        )
        return
      }
      tags.push({ base_relative_path })
    })
  }

  // Extract hashtags from entity content
  if (entity_content) {
    const hashtag_regex = /(?<!^|\n)#([a-zA-Z0-9_/-]+)/g
    let match
    while ((match = hashtag_regex.exec(entity_content)) !== null) {
      const base_relative_path = match[1]
      if (!base_relative_path.match(/^(system|user)\//)) {
        log(
          `Warning: Invalid base_relative_path format: ${base_relative_path}. Must start with system/ or user/`
        )
        continue
      }
      tags.push({ base_relative_path })
    }
  }

  return tags
}
