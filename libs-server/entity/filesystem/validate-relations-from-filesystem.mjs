import debug from 'debug'
import { entity_exists_in_filesystem } from './entity-exists-in-filesystem.mjs'
import { resolve_base_uri_from_registry } from '#libs-server/base-uri/index.mjs'

const log = debug('entity:filesystem:validate:relations')

/**
 * Validate that relations exist in filesystem
 *
 * @param {Object} params - Parameters
 * @param {Array} params.relations - Array of relation objects
 * @returns {Promise<Object>} - Validation result {valid, errors?}
 */
export async function validate_relations_from_filesystem({ relations }) {
  if (!Array.isArray(relations)) {
    return {
      valid: false,
      errors: ['Relations must be an array']
    }
  }

  try {
    if (relations.length === 0) {
      return { valid: true }
    }

    log(`Validating ${relations.length} relations`)

    // Process relations
    const validation_promises = relations.map(async (relation) => {
      // Resolve the base_uri to absolute path using registry
      const absolute_path = resolve_base_uri_from_registry(relation.base_uri)

      const exists = await entity_exists_in_filesystem({
        absolute_path
      })

      return {
        base_uri: relation.base_uri,
        exists
      }
    })

    const results = await Promise.all(validation_promises)

    // Find missing relations
    const missing_relations = results.filter((result) => !result.exists)

    if (missing_relations.length === 0) {
      log('All relations validated successfully')
      return { valid: true }
    }

    return {
      valid: false,
      errors: missing_relations.map(
        (rel) => `Relation target entity not found: ${rel.base_uri}`
      )
    }
  } catch (error) {
    log('Error validating relations:', error)
    return {
      valid: false,
      errors: [`Relation validation error: ${error.message}`]
    }
  }
}

export default validate_relations_from_filesystem
