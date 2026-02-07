import { entity_exists_in_filesystem } from './entity-exists-in-filesystem.mjs'
import { resolve_base_uri_from_registry } from '#libs-server/base-uri/index.mjs'
import { create_validator } from '../validation/create-validator.mjs'

// Wrapper that takes base_uri and resolves to absolute_path
async function check_entity_exists_by_base_uri({ base_uri }) {
  const absolute_path = resolve_base_uri_from_registry(base_uri)
  return entity_exists_in_filesystem({ absolute_path })
}

const { validate_relations } = create_validator({
  debug_namespace: 'entity:filesystem',
  check_tag_exists: check_entity_exists_by_base_uri,
  check_entity_exists: check_entity_exists_by_base_uri,
  normalize_exists_result: (result) => result
})

/**
 * Validate that relations exist in filesystem
 *
 * @param {Object} params - Parameters
 * @param {Array} params.relations - Array of relation objects
 * @returns {Promise<Object>} - Validation result {valid, errors?}
 */
export const validate_relations_from_filesystem = validate_relations

export default validate_relations_from_filesystem
