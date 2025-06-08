import debug from 'debug'
import { validate_entity_properties } from '../validate-schema.mjs'
import { validate_tags_from_filesystem } from './validate-tags-from-filesystem.mjs'
import { validate_relations_from_filesystem } from './validate-relations-from-filesystem.mjs'
import { validate_references_from_filesystem } from './validate-references-from-filesystem.mjs'

const log = debug('entity:filesystem:validate')

/**
 * Validate entity from filesystem against schema
 *
 * @param {Object} params - Parameters
 * @param {Object} params.entity_properties - Entity properties for schema validation
 * @param {Object} [params.formatted_entity_metadata] - Entity metadata for validation
 * @param {Object} [params.schemas] - Schema definitions map
 * @returns {Promise<Object>} - Validation result {success, errors?}
 */
export async function validate_entity_from_filesystem({
  entity_properties,
  formatted_entity_metadata = {},
  schemas
}) {
  // Validate required parameters
  if (!entity_properties || typeof entity_properties !== 'object') {
    return {
      success: false,
      error: 'Invalid entity properties'
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

  try {
    log(`Validating entity from filesystem: ${entity_properties.entity_id}`)

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
        errors: schema_result.errors || []
      }
    }

    // Run remaining validations in parallel
    const [tags_result, relations_result, references_result] =
      await Promise.all([
        // Validate tags existence in filesystem
        validate_tags_from_filesystem({
          ...formatted_entity_metadata
        }),

        // Validate relations existence in filesystem
        validate_relations_from_filesystem({
          ...formatted_entity_metadata
        }),

        // Validate references existence in filesystem
        validate_references_from_filesystem({
          ...formatted_entity_metadata
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
        errors: all_errors
      }
    }

    log('Entity validation successful')
    return {
      success: true
    }
  } catch (error) {
    log('Error validating entity from filesystem:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

export default validate_entity_from_filesystem
