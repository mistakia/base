import debug from 'debug'
import { validate_entity_properties } from '#libs-server/entity/validate-schema.mjs'
import { validate_tags_from_git } from './validate-tags-from-git.mjs'
import { validate_relations_from_git } from './validate-relations-from-git.mjs'
import { validate_references_from_git } from './validate-references-from-git.mjs'

const log = debug('entity:git:validate')

/**
 * Validate entity from git against all validation rules
 *
 * @param {Object} params - Parameters
 * @param {Object} params.entity_properties - Entity properties for schema validation
 * @param {Object} params.formatted_entity_metadata - Formatted entity metadata for validating tags, relations, references
 * @param {string} params.repo_path - Git repository path
 * @param {string} params.branch - Git branch
 * @param {Object} [params.schemas] - Schema definitions map
 * @returns {Promise<Object>} - Validation result {success, errors?}
 */
export async function validate_entity_from_git({
  entity_properties,
  formatted_entity_metadata = {},
  repo_path,
  branch,
  schemas
}) {
  // Validate required parameters
  if (!entity_properties || typeof entity_properties !== 'object') {
    return {
      success: false,
      error: 'Invalid entity properties',
      branch
    }
  }

  if (
    !formatted_entity_metadata ||
    typeof formatted_entity_metadata !== 'object'
  ) {
    log(
      'Warning: No formatted_entity_metadata provided, some validations may be skipped'
    )
  }

  if (!repo_path) {
    return {
      success: false,
      error: 'Repository path is required',
      branch
    }
  }

  if (!branch) {
    return {
      success: false,
      error: 'Branch is required',
      repo_path
    }
  }

  try {
    log(`Validating entity from git (branch: ${branch})`)

    // Run schema validation if schemas are provided
    const schema_result = schemas
      ? await validate_entity_properties({
          entity_properties,
          entity_type: entity_properties.type,
          schemas
        })
      : { valid: true }

    // Skip further validations if schema validation failed
    if (!schema_result.valid) {
      return {
        success: schema_result.valid,
        errors: schema_result.errors || [],
        branch
      }
    }

    // Run remaining validations in parallel
    const [tags_result, relations_result, references_result] =
      await Promise.all([
        // Validate tags existence in git
        validate_tags_from_git({
          ...formatted_entity_metadata,
          repo_path,
          branch
        }),

        // Validate relations existence in git
        validate_relations_from_git({
          ...formatted_entity_metadata,
          repo_path,
          branch
        }),

        // Validate references existence in git
        validate_references_from_git({
          ...formatted_entity_metadata,
          repo_path,
          branch
        })
      ])

    // Combine all validation errors
    const all_errors = [
      ...(schema_result.errors || []),
      ...(tags_result.errors || []),
      ...(relations_result.errors || []),
      ...(references_result.errors || [])
    ].map(String)

    if (all_errors.length > 0) {
      return {
        success: false,
        errors: all_errors,
        branch
      }
    }

    log(`Entity validation successful in branch ${branch}`)
    return {
      success: true,
      branch
    }
  } catch (error) {
    log('Error validating entity from git:', error)
    return {
      success: false,
      error: error.message,
      branch
    }
  }
}

export default validate_entity_from_git
