import { entity_exists_in_git } from './entity-exists-in-git.mjs'
import { create_validator } from '#libs-server/entity/validation/create-validator.mjs'

const { validate_tags } = create_validator({
  debug_namespace: 'entity:git',
  check_tag_exists: entity_exists_in_git,
  check_entity_exists: entity_exists_in_git,
  normalize_exists_result: (result) => result.success && result.exists
})

/**
 * Validate that tags exist in git
 *
 * @param {Object} params - Parameters
 * @param {Array} params.property_tags - Array of tag objects from properties
 * @param {string} params.branch - Git branch for validation
 * @returns {Promise<Object>} - Validation result {valid, errors?}
 */
export async function validate_tags_from_git({ property_tags = [], branch }) {
  if (!branch) {
    return {
      valid: false,
      errors: ['Branch is required']
    }
  }

  return validate_tags({ property_tags, branch })
}

export default validate_tags_from_git
