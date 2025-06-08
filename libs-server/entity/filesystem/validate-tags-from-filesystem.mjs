import debug from 'debug'
import { tag_exists_in_filesystem } from '#libs-server/tag/filesystem/tag-exists-in-filesystem.mjs'

const log = debug('entity:filesystem:validate:tags')

/**
 * Validate that tags exist in filesystem
 *
 * @param {Object} params - Parameters
 * @param {Array} params.property_tags - Array of tag objects from properties
 * @returns {Promise<Object>} - Validation result {valid, errors?}
 */
export async function validate_tags_from_filesystem({ property_tags = [] }) {
  if (!Array.isArray(property_tags)) {
    return {
      valid: false,
      errors: ['property_tags must be an array']
    }
  }

  try {
    if (property_tags.length === 0) {
      return { valid: true }
    }

    log(`Validating ${property_tags.length} tags`)

    const all_tags = [
      ...property_tags.map((tag) => ({ ...tag, source: 'property' }))
    ]

    const tag_validation_promises = all_tags.map(async (tag) => {
      const exists = await tag_exists_in_filesystem({
        base_uri: tag.base_uri
      })
      return {
        base_uri: tag.base_uri,
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
        (tag) => `${tag.source} tag not found: ${tag.base_uri}`
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
