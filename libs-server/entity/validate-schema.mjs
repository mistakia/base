import debug from 'debug'
import Validator from 'fastest-validator'

const log = debug('entity:validation:schema')

// Create validator instance with proper configuration
const validator = new Validator({
  useNewCustomCheckerFunction: true, // Enable new custom validator feature
  defaults: {
    object: {
      strict: false // Don't be strict about extra properties
    }
  }
})

/**
 * Build validation schema for a specific entity type
 * @param {String} entity_type Entity type to build schema for
 * @param {Object} schemas Loaded schema definitions
 * @returns {Object|null} Validation schema or null if no schema exists
 */
export function build_validation_schema(entity_type, schemas) {
  // Validate inputs
  if (!entity_type || typeof entity_type !== 'string') {
    throw new Error('entity_type must be a string')
  }

  if (!schemas || typeof schemas !== 'object') {
    throw new Error('schemas must be an object')
  }

  const schema = schemas[entity_type]

  if (!schema) {
    return null
  }

  // Handle properties that are in array format
  let properties = {}

  if (schema.properties) {
    if (Array.isArray(schema.properties)) {
      // Transform array of properties to object with property names as keys
      schema.properties.forEach((prop) => {
        if (prop && prop.name) {
          const property_schema = {
            type: prop.type
          }

          // Add additional constraints only if they exist
          if (prop.required !== undefined)
            property_schema.required = prop.required
          if (prop.optional !== undefined)
            property_schema.optional = prop.optional
          if (prop.items) property_schema.items = prop.items
          if (prop.enum) property_schema.enum = prop.enum
          if (prop.min !== undefined) property_schema.min = prop.min
          if (prop.max !== undefined) property_schema.max = prop.max
          if (prop.properties) property_schema.properties = prop.properties
          if (prop.description) property_schema.description = prop.description

          properties[prop.name] = property_schema
        }
      })
    } else {
      // Properties are already in object format
      properties = schema.properties
    }
  }

  // Special handling for the meta-schema (the type_definition that defines itself)
  const is_meta_schema_definition =
    entity_type === 'type_definition' && schema.type_name === 'type_definition'

  if (
    is_meta_schema_definition &&
    properties.properties &&
    properties.properties.items &&
    properties.properties.items.properties
  ) {
    // Make the nested property fields optional for the meta-schema
    const property_fields = properties.properties.items.properties

    // Remove required constraint from all fields in property items schema
    for (const field in property_fields) {
      if (property_fields[field]) {
        // Make the field optional by setting required to false explicitly
        property_fields[field].required = false
      }
    }
  }

  // Build validation schema according to fastest-validator spec
  const validation_schema = {
    $$strict: false, // Don't fail on unknown properties
    title: { type: 'string', min: 1 },
    type: { type: 'string', enum: [entity_type] },
    ...properties
  }

  return validation_schema
}

/**
 * Validate entity properties against schema definitions
 *
 * @param {Object} params - Parameters
 * @param {Object} params.entity_properties - Entity properties to validate
 * @param {string} params.entity_type - Entity type for schema lookup
 * @param {Object} params.schemas - Schema definitions
 * @returns {Object} - Validation result {valid, errors?}
 */
export async function validate_entity_properties({
  entity_properties,
  entity_type,
  schemas
}) {
  if (!entity_properties || typeof entity_properties !== 'object') {
    return {
      valid: false,
      errors: ['Entity properties missing or invalid']
    }
  }

  if (!entity_type) {
    return {
      valid: false,
      errors: ['Entity type is required for schema validation']
    }
  }

  // Build validation schema for entity type
  const validation_schema = build_validation_schema(entity_type, schemas)

  // No schema found is not an error
  if (!validation_schema) {
    log(`No schema found for type: ${entity_type}`)
    return { valid: true }
  }

  try {
    // Special handling for meta-schemas (schema definitions about type_definition)
    const type_name = entity_properties.type_name
    const is_meta_schema =
      entity_type === 'type_definition' && type_name === 'type_definition'
    const is_type_extension =
      entity_type === 'type_definition' && type_name === 'type_extension'

    let schema_to_use = validation_schema

    if (is_meta_schema || is_type_extension) {
      // Create a copy to modify
      schema_to_use = JSON.parse(JSON.stringify(validation_schema))

      // Make properties optional for type_extension schema definition
      if (is_type_extension && schema_to_use.properties) {
        schema_to_use.properties.required = false
      }

      // For the meta-schema that defines type_definition itself, be lenient
      if (
        is_meta_schema &&
        schema_to_use.properties &&
        schema_to_use.properties.items &&
        schema_to_use.properties.items.properties
      ) {
        const property_props = schema_to_use.properties.items.properties

        // Make all nested validation fields optional
        Object.keys(property_props).forEach((field) => {
          if (property_props[field]) {
            property_props[field].required = false
          }
        })
      }

      // Make extends optional for type_definition schema
      if (schema_to_use.extends) {
        schema_to_use.extends.required = false
      }
    }

    // Compile schema (reuse compiled schema if possible)
    const check =
      typeof schema_to_use === 'function'
        ? schema_to_use
        : validator.compile(schema_to_use)

    // Run validation
    const validation_result = check(entity_properties)

    if (validation_result === true) {
      return { valid: true }
    } else {
      // Format validation errors
      const errors = validation_result.map(
        (err) => `${err.field}: ${err.message}`
      )

      return {
        valid: false,
        errors
      }
    }
  } catch (error) {
    log('Error validating schema:', error)
    return {
      valid: false,
      errors: [`Schema validation error: ${error.message}`]
    }
  }
}

export default validate_entity_properties
