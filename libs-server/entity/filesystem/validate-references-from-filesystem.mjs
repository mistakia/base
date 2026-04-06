import { entity_exists_in_filesystem } from './entity-exists-in-filesystem.mjs'
import { resolve_base_uri_from_registry } from '#libs-server/base-uri/index.mjs'
import { create_validator } from '#libs-server/entity/validation/create-validator.mjs'

// Wrapper that takes base_uri and resolves to absolute_path
async function check_entity_exists_by_base_uri({ base_uri }) {
  const absolute_path = resolve_base_uri_from_registry(base_uri)
  return entity_exists_in_filesystem({ absolute_path })
}

const { validate_references } = create_validator({
  debug_namespace: 'entity:filesystem',
  check_tag_exists: check_entity_exists_by_base_uri,
  check_entity_exists: check_entity_exists_by_base_uri,
  normalize_exists_result: (result) => result
})

/**
 * Validate that references in content exist in filesystem
 *
 * @param {Object} params - Parameters
 * @param {Array} params.references - Array of reference objects
 * @returns {Promise<Object>} - Validation result {valid, errors?}
 */
export const validate_references_from_filesystem = validate_references

export default validate_references_from_filesystem
