import Validator from 'fastest-validator'
import schema_module from './schema.mjs'
import debug from 'debug'

const log = debug('markdown:validator')

const v = new Validator({
  useNewCustomCheckerFunction: true, // Enable new custom validator feature
  defaults: {
    object: {
      strict: false // Don't be strict about extra properties
    }
  }
})

/**
 * Validate entity against schema
 * @param {Object} parsed_data Parsed markdown data
 * @param {Object} schemas Schema definitions map
 * @returns {Object} Validation result {valid, errors?}
 */
export function validate_entity(parsed_data, schemas) {
  // Validate inputs
  if (!parsed_data || typeof parsed_data !== 'object') {
    throw new Error('parsed_data must be an object')
  }

  if (!parsed_data.frontmatter || typeof parsed_data.frontmatter !== 'object') {
    throw new Error('parsed_data must contain frontmatter object')
  }

  if (!schemas || typeof schemas !== 'object') {
    log('No schemas provided for validation, returning valid')
    return { valid: true }
  }

  const entity_type = parsed_data.frontmatter.type
  const type_name = parsed_data.frontmatter.type_name

  // Build validation schema
  const validation_schema = schema_module.build_validation_schema(
    entity_type,
    schemas
  )

  if (!validation_schema) {
    log(`No schema found for entity type: ${entity_type}`)
    return { valid: true } // Allow if no schema exists
  }

  // Special handling for meta-schemas (schema definitions about type_definition)
  const is_meta_schema =
    entity_type === 'type_definition' && type_name === 'type_definition'
  const is_type_extension =
    entity_type === 'type_definition' && type_name === 'type_extension'

  if (is_meta_schema || is_type_extension) {
    // Make properties optional for type_extension schema definition
    if (is_type_extension && validation_schema.properties) {
      validation_schema.properties.required = false
    }

    // For the meta-schema that defines type_definition itself, be lenient
    if (
      is_meta_schema &&
      validation_schema.properties &&
      validation_schema.properties.items &&
      validation_schema.properties.items.properties
    ) {
      const property_props = validation_schema.properties.items.properties

      // Make all nested validation fields optional
      Object.keys(property_props).forEach((field) => {
        if (property_props[field]) {
          property_props[field].required = false
        }
      })
    }

    // Make extends optional for type_definition schema
    if (validation_schema.extends) {
      validation_schema.extends.required = false
    }
  }

  // Prepare data to validate
  const data_to_validate = {
    ...parsed_data.frontmatter
  }

  // Run validation
  const check = v.compile(validation_schema)
  const result = check(data_to_validate)

  // fastest-validator returns true for valid results and array of errors for invalid results
  if (result !== true) {
    log({
      validation_schema: JSON.stringify(validation_schema, null, 2),
      data_to_validate
    })

    return { valid: false, errors: result }
  }

  return { valid: true }
}

export default {
  validate_entity
}
