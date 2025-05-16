import debug from 'debug'
import { tag_exists_in_git } from '#libs-server/tag/git/tag-exists-in-git.mjs'

const log = debug('entity:git:validate:tags')

/**
 * Validate that tags exist in git
 *
 * @param {Object} params - Parameters
 * @param {Array} params.tags - Array of tag objects
 * @param {string} params.repo_path - Git repository path
 * @param {string} params.branch - Git branch for validation
 * @returns {Promise<Object>} - Validation result {valid, errors?}
 */
export async function validate_tags_from_git({ tags, repo_path, branch }) {
  if (!Array.isArray(tags)) {
    return {
      valid: false,
      errors: ['Tags must be an array']
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
    if (tags.length === 0) {
      return { valid: true }
    }

    log(`Validating ${tags.length} tags`)

    // Check each tag exists
    const tag_validation_promises = tags.map(async (tag) => {
      const exists = await tag_exists_in_git({
        base_relative_path: tag.base_relative_path,
        ref: branch,
        repository_path: repo_path
      })

      return {
        base_relative_path: tag.base_relative_path,
        exists
      }
    })

    const tag_results = await Promise.all(tag_validation_promises)

    // Find missing tags
    const missing_tags = tag_results.filter((result) => !result.exists)

    if (missing_tags.length === 0) {
      log('All tags validated successfully')
      return { valid: true }
    }

    return {
      valid: false,
      errors: missing_tags.map(
        (tag) => `Tag not found: ${tag.base_relative_path}`
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
