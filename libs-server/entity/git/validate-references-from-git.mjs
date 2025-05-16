import debug from 'debug'
import { entity_exists_in_git } from './entity-exists-in-git.mjs'

const log = debug('entity:git:validate:references')

/**
 * Validate that references in content exist in git
 *
 * @param {Object} params - Parameters
 * @param {Array} params.references - Array of reference objects
 * @param {string} params.repo_path - Git repository path
 * @param {string} params.branch - Git branch for validation
 * @returns {Promise<Object>} - Validation result {valid, errors?}
 */
export async function validate_references_from_git({
  references,
  repo_path,
  branch
}) {
  if (!Array.isArray(references)) {
    return {
      valid: false,
      errors: ['References must be an array']
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
    if (references.length === 0) {
      return { valid: true } // No references found
    }

    // Extract reference paths from reference objects
    const reference_paths = references.map((ref) => ref.reference_path)

    log(`Validating ${reference_paths.length} references`)

    // Validate each reference
    const validation_promises = reference_paths.map(async (reference) => {
      // Add .md extension if not present
      const file_path = reference.endsWith('.md')
        ? reference
        : `${reference}.md`

      // Check if the referenced entity exists
      const reference_exists = await entity_exists_in_git({
        repo_path,
        file_path,
        branch
      })

      return {
        reference,
        exists: reference_exists.success && reference_exists.exists,
        path: file_path
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

export default validate_references_from_git
