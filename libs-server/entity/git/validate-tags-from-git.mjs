import debug from 'debug'
import { tag_exists_in_git } from '#libs-server/tag/git/tag-exists-in-git.mjs'

const log = debug('entity:git:validate:tags')

/**
 * Validate that tags exist in git
 *
 * @param {Object} params - Parameters
 * @param {Array} params.property_tags - Array of tag objects from properties
 * @param {string} params.repo_path - Git repository path
 * @param {string} params.branch - Git branch for validation
 * @returns {Promise<Object>} - Validation result {valid, errors?}
 */
export async function validate_tags_from_git({
  property_tags = [],
  repo_path,
  branch
}) {
  if (!Array.isArray(property_tags)) {
    return {
      valid: false,
      errors: ['property_tags must be an array']
    }
  }

  if (!repo_path) {
    return {
      valid: false,
      errors: ['Repository path is required']
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

    const all_tags = [
      ...property_tags.map((tag) => ({ ...tag, source: 'property' }))
    ]

    const tag_validation_promises = all_tags.map(async (tag) => {
      const exists = await tag_exists_in_git({
        base_relative_path: tag.base_relative_path,
        ref: branch,
        repository_path: repo_path
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

export default validate_tags_from_git
