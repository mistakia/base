import { validate_markdown_entity_schema } from './schema-validator.mjs'
import { validate_tags_exist } from './tag-validator.mjs'
import { validate_relations_exist } from './relation-validator.mjs'
import { validate_references_exist } from './reference-validator.mjs'
import debug from 'debug'

const log = debug('markdown:validator')

/**
 * Common validation function that delegates to the appropriate source-based validator
 *
 * @param {Object} params - Parameters
 * @param {Object} params.formatted_markdown_entity - Formatted markdown data
 * @param {Object} [params.schemas] - Schema definitions map
 * @param {string} [params.system_branch] - Optional git branch to check system content in (tags)
 * @param {string} [params.user_branch] - Optional git branch to check user content in (entities)
 * @param {boolean} [params.skip_entity_validations=false] - If true, only schema validation is performed
 * @param {string} [params.source='git'] - Source ('git' or 'filesystem')
 * @returns {Promise<Object>} - Validation result {valid, errors?}
 */
export async function validate_markdown_entity({
  formatted_markdown_entity,
  schemas,
  system_branch,
  user_branch,
  skip_entity_validations = false,
  source = 'git'
}) {
  if (source === 'git') {
    return validate_markdown_entity_from_git({
      formatted_markdown_entity,
      schemas,
      system_branch,
      user_branch,
      skip_entity_validations
    })
  } else if (source === 'filesystem') {
    return validate_markdown_entity_from_filesystem({
      formatted_markdown_entity,
      schemas,
      skip_entity_validations
    })
  } else {
    return {
      valid: false,
      errors: [
        `Invalid validation source: ${source}. Use 'git' or 'filesystem'`
      ]
    }
  }
}

/**
 * Validate a markdown entity against all validation rules using git-based validation
 *
 * @param {Object} params - Parameters
 * @param {Object} params.formatted_markdown_entity - Formatted markdown data
 * @param {Object} [params.schemas] - Schema definitions map
 * @param {string} [params.system_branch] - Optional git branch to check system content in (tags)
 * @param {string} [params.user_branch] - Optional git branch to check user content in (entities)
 * @param {boolean} [params.skip_entity_validations=false] - If true, only schema validation is performed
 * @returns {Promise<Object>} - Validation result {valid, errors?}
 */
export async function validate_markdown_entity_from_git({
  formatted_markdown_entity,
  schemas,
  system_branch,
  user_branch,
  skip_entity_validations = false
}) {
  if (
    !formatted_markdown_entity ||
    typeof formatted_markdown_entity !== 'object'
  ) {
    return {
      valid: false,
      errors: ['No document or invalid document provided for validation']
    }
  }

  if (!schemas || Object.keys(schemas).length === 0) {
    log('No schemas provided, skipping schema validation')
  }

  try {
    // Always run schema validation if schemas are provided
    const schema_result =
      schemas && Object.keys(schemas).length > 0
        ? validate_markdown_entity_schema({
            formatted_markdown_entity,
            schemas
          })
        : { valid: true }

    // Skip entity validations if requested or in simple validation mode
    if (skip_entity_validations) {
      return schema_result
    }

    // Run remaining validations in parallel
    const [tags_result, relations_result, references_result] =
      await Promise.all([
        // Tag existence validation (system content)
        validate_tags_exist({
          formatted_markdown_entity,
          system_branch,
          user_branch
        }),

        // Relations existence validation (user content)
        validate_relations_exist({
          formatted_markdown_entity,
          system_branch,
          user_branch
        }),

        // References existence validation (user content)
        validate_references_exist({
          formatted_markdown_entity,
          system_branch,
          user_branch
        })
      ])

    // Combine all validation errors
    const all_errors = [
      ...(schema_result.errors || []),
      ...(tags_result.errors || []),
      ...(relations_result.errors || []),
      ...(references_result.errors || [])
    ].map((error) => {
      // Convert error objects to strings if needed
      if (error instanceof Error) {
        return error.message
      } else if (typeof error === 'object') {
        return error.message || JSON.stringify(error, null, 2)
      }
      return String(error)
    })

    if (all_errors.length > 0) {
      log('Validation failed with errors:', all_errors)
      return {
        valid: false,
        errors: all_errors
      }
    }

    return { valid: true }
  } catch (error) {
    log('Error validating markdown:', error)
    return { valid: false, errors: [error.message] }
  }
}

/**
 * Validate a markdown entity against validation rules using filesystem
 *
 * @param {Object} params - Parameters
 * @param {Object} params.formatted_markdown_entity - Formatted markdown data
 * @param {Object} [params.schemas] - Schema definitions map
 * @param {boolean} [params.skip_entity_validations=false] - If true, only schema validation is performed
 * @returns {Promise<Object>} - Validation result {valid, errors?}
 */
export async function validate_markdown_entity_from_filesystem({
  formatted_markdown_entity,
  schemas,
  skip_entity_validations = false
}) {
  if (
    !formatted_markdown_entity ||
    typeof formatted_markdown_entity !== 'object'
  ) {
    return {
      valid: false,
      errors: ['No document or invalid document provided for validation']
    }
  }

  if (!schemas || Object.keys(schemas).length === 0) {
    log('No schemas provided, skipping schema validation')
  }

  try {
    // Always run schema validation if schemas are provided
    const schema_result =
      schemas && Object.keys(schemas).length > 0
        ? validate_markdown_entity_schema({
            formatted_markdown_entity,
            schemas
          })
        : { valid: true }

    // Skip entity validations if requested
    if (skip_entity_validations) {
      return schema_result
    }

    // For filesystem validation, we skip git-based validations
    // In a real implementation, filesystem-based validation methods would be added here

    // Return schema validation result for now
    return schema_result
  } catch (error) {
    log('Error validating markdown from filesystem:', error)
    return { valid: false, errors: [error.message] }
  }
}
