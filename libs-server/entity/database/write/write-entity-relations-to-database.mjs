import debug from 'debug'

const log = debug('entity:database:write-relations')

/**
 * Write entity relations to database
 *
 * @param {Object} params Parameters
 * @param {string} params.entity_id Source entity ID
 * @param {Array} params.relations Array of structured relation objects with { relation_type, entity_id, context }
 * @param {string} params.user_id User ID
 * @param {Object} params.db_client Database client
 * @returns {Promise<void>}
 */
export async function write_entity_relations_to_database({
  entity_id,
  relations,
  user_id,
  db_client
}) {
  log(`Writing relations for entity: ${entity_id}`)

  // Remove existing relations for this entity
  await db_client('entity_relations')
    .where({ source_entity_id: entity_id })
    .delete()

  // Process structured relations
  log(`Adding ${relations.length} structured relations`)

  const relations_data = relations.map((relation) => ({
    source_entity_id: entity_id,
    target_entity_id: relation.entity_id,
    relation_type: relation.relation_type,
    context: relation.context || null,
    created_at: new Date()
  }))

  if (relations_data.length > 0) {
    await db_client('entity_relations').insert(relations_data)
  }

  log(`Relations written successfully for entity: ${entity_id}`)
}

export default write_entity_relations_to_database
