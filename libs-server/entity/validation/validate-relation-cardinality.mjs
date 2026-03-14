import debug from 'debug'

const log = debug('entity:validation:relation-cardinality')

/**
 * Validate relation cardinality constraints from schema against entity relations.
 *
 * @param {Object} params - Parameters
 * @param {Object} params.entity_properties - Entity properties to check
 * @param {string} params.entity_type - Entity type for schema lookup
 * @param {Object} params.schemas - Schema definitions map
 * @returns {Object} - { warnings: string[] }
 */
export function validate_relation_cardinality({ entity_properties, entity_type, schemas }) {
  const warnings = []

  if (!entity_type || !schemas) {
    return { warnings }
  }

  const schema = schemas[entity_type]
  if (
    !schema ||
    !Array.isArray(schema.relation_constraints) ||
    schema.relation_constraints.length === 0
  ) {
    return { warnings }
  }

  const relations = entity_properties.relations
  if (!Array.isArray(relations) || relations.length === 0) {
    return { warnings }
  }

  log(`Evaluating ${schema.relation_constraints.length} relation constraints for type: ${entity_type}`)

  // Group relations by type (first token before [[)
  const counts_by_type = {}
  for (const relation of relations) {
    if (typeof relation !== 'string') continue
    const type = relation.split(/\s+/)[0]
    counts_by_type[type] = (counts_by_type[type] || 0) + 1
  }

  for (const constraint of schema.relation_constraints) {
    const count = counts_by_type[constraint.type] || 0
    if (count > constraint.max_count) {
      log(`Cardinality exceeded for ${constraint.type}: ${count} > ${constraint.max_count}`)
      warnings.push(constraint.message)
    }
  }

  return { warnings }
}
