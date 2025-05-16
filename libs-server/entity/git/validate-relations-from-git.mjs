import debug from 'debug'
import { entity_exists_in_git } from './entity-exists-in-git.mjs'

const log = debug('entity:git:validate:relations')

/**
 * Validate that relations exist in git
 *
 * @param {Object} params - Parameters
 * @param {Array} params.relations - Array of relation objects
 * @param {string} params.repo_path - Git repository path
 * @param {string} params.branch - Git branch for validation
 * @returns {Promise<Object>} - Validation result {valid, errors?}
 */
export async function validate_relations_from_git({
  relations,
  repo_path,
  branch
}) {
  if (!Array.isArray(relations)) {
    return {
      valid: false,
      errors: ['Relations must be an array']
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
    if (relations.length === 0) {
      return { valid: true }
    }

    log(`Validating ${relations.length} relations`)

    // Process relations
    const validation_promises = relations.map(async (relation) => {
      const entity_path = relation.entity_path

      // Check if the relation target exists
      const exists_result = await entity_exists_in_git({
        repo_path,
        file_path: `${entity_path}.md`,
        branch
      })

      return {
        entity_path,
        exists: exists_result.success && exists_result.exists
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
        (rel) => `Relation target entity not found: ${rel.entity_path}`
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

export default validate_relations_from_git
