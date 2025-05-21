import path from 'path'
import debug from 'debug'
import { entity_exists_in_filesystem } from './entity-exists-in-filesystem.mjs'

const log = debug('entity:filesystem:validate:references')

/**
 * Validate that references in content exist in filesystem
 *
 * @param {Object} params - Parameters
 * @param {Array} params.references - Array of reference objects
 * @param {string} params.root_base_directory - Root base directory
 * @returns {Promise<Object>} - Validation result {valid, errors?}
 */
export async function validate_references_from_filesystem({
  references,
  root_base_directory
}) {
  if (!root_base_directory) {
    return {
      valid: false,
      errors: ['Root base directory is required']
    }
  }

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

    // Extract reference paths from reference objects
    const reference_paths = references.map((ref) => ref.reference_path)

    log(`Validating ${reference_paths.length} references`)

    // Validate each reference
    const validation_promises = reference_paths.map(async (reference) => {
      const absolute_path = path.join(root_base_directory, reference)

      // Check if the referenced entity exists
      const exists = await entity_exists_in_filesystem({
        absolute_path
      })

      return {
        reference,
        exists
      }
    })

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
        (ref) => `Reference not found: ${ref.reference} (${ref.path})`
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
