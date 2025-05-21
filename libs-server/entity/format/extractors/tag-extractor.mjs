import debug from 'debug'

const log = debug('entity:format:extractors:tag-extractor')

/**
 * Extract tags from entity properties
 * @param {Object} options - Function options
 * @param {Object} options.entity_properties - The entity properties
 * @returns {Object} Extracted entity tags
 */
export function extract_entity_tags({ entity_properties = {} }) {
  const property_tags = []

  // Extract tags from entity properties
  if (entity_properties.tags && Array.isArray(entity_properties.tags)) {
    entity_properties.tags.forEach((base_relative_path) => {
      property_tags.push({ base_relative_path })
    })
  }

  return {
    property_tags
  }
}
