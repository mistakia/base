import { tag_exists_in_filesystem } from '#libs-server/tag/filesystem/tag-exists-in-filesystem.mjs'
import { create_validator } from '../validation/create-validator.mjs'

const { validate_tags } = create_validator({
  debug_namespace: 'entity:filesystem',
  check_tag_exists: tag_exists_in_filesystem,
  check_entity_exists: tag_exists_in_filesystem,
  normalize_exists_result: (result) => result
})

/**
 * Validate that tags exist in filesystem
 *
 * @param {Object} params - Parameters
 * @param {Array} params.property_tags - Array of tag objects from properties
 * @returns {Promise<Object>} - Validation result {valid, errors?}
 */
export const validate_tags_from_filesystem = validate_tags

export default validate_tags_from_filesystem
