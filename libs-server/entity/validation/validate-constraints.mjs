import debug from 'debug'

const log = debug('entity:validation:constraints')

/**
 * Validate cross-field constraints from schema against entity properties.
 *
 * @param {Object} params - Parameters
 * @param {Object} params.entity_properties - Entity properties to check
 * @param {string} params.entity_type - Entity type for schema lookup
 * @param {Object} params.schemas - Schema definitions map
 * @returns {Object} - { warnings: string[] }
 */
export function validate_constraints({ entity_properties, entity_type, schemas }) {
  const warnings = []

  if (!entity_type || !schemas) {
    return { warnings }
  }

  const schema = schemas[entity_type]
  if (!schema || !Array.isArray(schema.constraints) || schema.constraints.length === 0) {
    return { warnings }
  }

  log(`Evaluating ${schema.constraints.length} constraints for type: ${entity_type}`)

  for (const constraint of schema.constraints) {
    if (constraint.rule === 'conflicts') {
      const condition_matches =
        entity_properties[constraint.condition_field] === constraint.condition_value
      const field_matches =
        entity_properties[constraint.field] === constraint.field_value

      if (condition_matches && field_matches) {
        log(`Conflict detected: ${constraint.message}`)
        warnings.push(constraint.message)
      }
    }
  }

  return { warnings }
}
