import debug from 'debug'
import { tag_exists_in_filesystem } from '#libs-server/tag/filesystem/tag-exists-in-filesystem.mjs'

const log = debug('entity:filesystem:validate:tags')

/**
 * Validate that tags exist in filesystem
 *
 * @param {Object} params - Parameters
 * @param {Array} params.property_tags - Array of tag objects from properties
 * @param {Array} params.content_tags - Array of tag objects from content
 * @param {string} params.root_base_directory - Root base directory
 * @returns {Promise<Object>} - Validation result {valid, errors?}
 */
export async function validate_tags_from_filesystem({
  property_tags = [],
  content_tags = [],
  root_base_directory
}) {
  if (!Array.isArray(property_tags) || !Array.isArray(content_tags)) {
    return {
      valid: false,
      errors: ['property_tags and content_tags must be arrays']
    }
  }

  if (!root_base_directory) {
    return {
      valid: false,
      errors: ['Root base directory is required']
    }
  }

  try {
    if (property_tags.length === 0 && content_tags.length === 0) {
      return { valid: true }
    }

    log(`Validating ${property_tags.length + content_tags.length} tags`)

    // Combine both arrays for validation, tagging their source
    const all_tags = [
      ...property_tags.map((tag) => ({ ...tag, source: 'property' })),
      ...content_tags.map((tag) => ({ ...tag, source: 'content' }))
    ]

    const tag_validation_promises = all_tags.map(async (tag) => {
      const exists = await tag_exists_in_filesystem({
        base_relative_path: tag.base_relative_path,
        root_base_directory
      })
      return {
        base_relative_path: tag.base_relative_path,
        exists,
        source: tag.source
      }
    })

    const tag_results = await Promise.all(tag_validation_promises)
    const missing_tags = tag_results.filter((result) => !result.exists)

    if (missing_tags.length === 0) {
      log('All tags validated successfully')
      return { valid: true }
    }

    return {
      valid: false,
      errors: missing_tags.map(
        (tag) => `${tag.source} tag not found: ${tag.base_relative_path}`
      )
    }
  } catch (error) {
    log('Error validating tags:', error)
    return {
      valid: false,
      errors: [`Tag validation error: ${error.message}`]
    }
  }
}

export default validate_tags_from_filesystem
