import debug from 'debug'
import { entity_exists_in_git } from './entity-exists-in-git.mjs'

const log = debug('entity:git:validate:references')

/**
 * Validate that references in content exist in git
 *
 * @param {Object} params - Parameters
 * @param {Array} params.references - Array of reference objects
 * @param {string} params.branch - Git branch for validation
 * @returns {Promise<Object>} - Validation result {valid, errors?}
 */
export async function validate_references_from_git({
  references = [],
  branch
}) {
  if (!Array.isArray(references)) {
    return {
      valid: false,
      errors: ['References must be an array']
    }
  }

  if (!branch) {
    return {
      valid: false,
      errors: ['Branch is required']
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
        // Check if the referenced entity exists
        const reference_exists = await entity_exists_in_git({
          base_uri: reference_base_uri,
          branch
        })

        return {
          reference_base_uri,
          exists: reference_exists.success && reference_exists.exists
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
        (ref) => `Reference not found: ${ref.reference_base_uri} (${ref.path})`
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

export default validate_references_from_git
