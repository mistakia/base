import debug from 'debug'
import { entity_exists_in_filesystem } from './entity-exists-in-filesystem.mjs'
import { resolve_base_uri_from_registry } from '#libs-server/base-uri/index.mjs'

const log = debug('entity:filesystem:validate:references')

/**
 * Validate that references in content exist in filesystem
 *
 * @param {Object} params - Parameters
 * @param {Array} params.references - Array of reference objects
 * @returns {Promise<Object>} - Validation result {valid, errors?}
 */
export async function validate_references_from_filesystem({ references }) {
  if (!Array.isArray(references)) {
    return {
      valid: false,
      errors: ['References must be an array']
    }
  }

  try {
    if (references.length === 0) {
      return { valid: true } // No references found
    }

    // Extract base_uri paths from reference objects
    const reference_base_uris = references.map((ref) => ref.base_uri)

    log(`Validating ${reference_base_uris.length} references`)

    // Validate each reference
    const validation_promises = reference_base_uris.map(
      async (reference_base_uri) => {
        // Resolve the base_uri to absolute path using registry
        const absolute_path = resolve_base_uri_from_registry(reference_base_uri)

        // Check if the referenced entity exists
        const exists = await entity_exists_in_filesystem({
          absolute_path
        })

        return {
          reference_base_uri,
          exists
        }
      }
    )

    const reference_results = await Promise.all(validation_promises)

    // Find missing references
    const missing_references = reference_results.filter(
      (result) => !result.exists
    )

    if (missing_references.length === 0) {
      log('All references validated successfully')
      return { valid: true }
    }

    return {
      valid: false,
      errors: missing_references.map(
        (ref) => `Reference not found: ${ref.reference_base_uri}`
      )
    }
  } catch (error) {
    log('Error validating references:', error)
    return {
      valid: false,
      errors: [`Reference validation error: ${error.message}`]
    }
  }
}

export default validate_references_from_filesystem
