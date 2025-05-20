import debug from 'debug'
import { validate_entity_properties } from '../validate-schema.mjs'

const log = debug('entity:filesystem:validate')

/**
 * Validate entity from filesystem against schema
 *
 * @param {Object} params - Parameters
 * @param {Object} params.entity_properties - Entity properties for schema validation
 * @param {Object} [params.schemas] - Schema definitions map
 * @returns {Promise<Object>} - Validation result {success, errors?}
 */
export async function validate_entity_from_filesystem({
  entity_properties,
  schemas
}) {
  // Validate required parameters
  if (!entity_properties || typeof entity_properties !== 'object') {
    return {
      success: false,
      error: 'Invalid entity properties'
    }
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

    // For filesystem validation, we only validate schema for now
    // Future implementations could validate tags, relations, and references existence

    if (!schema_result.valid) {
      return {
        success: schema_result.valid,
        errors: schema_result.errors || []
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
