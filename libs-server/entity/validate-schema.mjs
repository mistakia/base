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
 * Transform property type for validation
 * @param {Object} property Property schema
 * @returns {Object} Transformed property schema
 */
function transform_property_type(property) {
  // Handle datetime type - convert to string with ISO 8601 format pattern
  if (property.type === 'datetime') {
    return {
      ...property,
      type: 'string',
      pattern:
        /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})?)?$/
    }
  }

  return property
}

function build_property_schema(prop) {
  if (!prop || !prop.name) return null

  // Handle array of objects with nested property definitions
  if (
    prop.type === 'array' &&
    prop.items &&
    prop.items.type === 'object' &&
    Array.isArray(prop.items.properties)
  ) {
    const item_properties = {}
    prop.items.properties.forEach((nested_prop) => {
      if (nested_prop && nested_prop.name) {
        item_properties[nested_prop.name] = {
          type: nested_prop.type,
          required: nested_prop.required === true,
          optional: nested_prop.required === false,
          ...(nested_prop.description
            ? { description: nested_prop.description }
            : {})
        }
      }
    })
    return {
      [prop.name]: {
        type: 'array',
        items: {
          type: 'object',
          properties: item_properties
        },
        ...(prop.required !== undefined ? { required: prop.required } : {}),
        ...(prop.optional !== undefined ? { optional: prop.optional } : {}),
        ...(prop.description ? { description: prop.description } : {})
      }
    }
  }

  // Handle regular property
  let property_schema = { type: prop.type }
  if (prop.required !== undefined) {
    property_schema.required = prop.required
    if (prop.required === false) property_schema.optional = true
  }
  if (prop.optional !== undefined) property_schema.optional = prop.optional
  if (prop.items) property_schema.items = prop.items
  if (prop.enum) property_schema.enum = prop.enum
  if (prop.min !== undefined) property_schema.min = prop.min
  if (prop.max !== undefined) property_schema.max = prop.max
  if (prop.properties) property_schema.properties = prop.properties
  if (prop.description) property_schema.description = prop.description
  property_schema = transform_property_type(property_schema)
  return { [prop.name]: property_schema }
}

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

  const properties = {}

  if (
    schema.properties &&
    Array.isArray(schema.properties) &&
    schema.properties.length > 0
  ) {
    schema.properties.forEach((prop) => {
      const prop_schema = build_property_schema(prop)
      if (prop_schema) Object.assign(properties, prop_schema)
    })
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
