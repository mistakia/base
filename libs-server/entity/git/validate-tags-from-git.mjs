import debug from 'debug'
import { entity_exists_in_git } from './entity-exists-in-git.mjs'
import { find_duplicate_tags } from '../validation/find-duplicate-tags.mjs'

const log = debug('entity:git:validate:tags')

/**
 * Validate that tags exist in git
 *
 * @param {Object} params - Parameters
 * @param {Array} params.property_tags - Array of tag objects from properties
 * @param {string} params.branch - Git branch for validation
 * @returns {Promise<Object>} - Validation result {valid, errors?}
 */
export async function validate_tags_from_git({ property_tags = [], branch }) {
  if (!Array.isArray(property_tags)) {
    return {
      valid: false,
      errors: ['property_tags must be an array']
    }
  }

  if (!branch) {
    return {
      valid: false,
      errors: ['Branch is required']
    }
  }

  try {
    if (property_tags.length === 0) {
      return { valid: true }
    }

    log(`Validating ${property_tags.length} tags`)

    // Check for duplicate tags
    const duplicate_tags = find_duplicate_tags({ tags: property_tags })
    if (duplicate_tags.length > 0) {
      return {
        valid: false,
        errors: duplicate_tags.map((uri) => `duplicate tag: ${uri}`)
      }
    }

    const all_tags = [
      ...property_tags.map((tag) => ({ ...tag, source: 'property' }))
    ]

    const tag_validation_promises = all_tags.map(async (tag) => {
      const exists_result = await entity_exists_in_git({
        base_uri: tag.base_uri,
        branch
      })
      return {
        base_uri: tag.base_uri,
        exists: exists_result.success && exists_result.exists,
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

export default validate_tags_from_git
