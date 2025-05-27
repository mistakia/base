import debug from 'debug'

const log = debug('entity:database:write-relations')

/**
 * Write entity relations to database
 *
 * @param {Object} params Parameters
 * @param {string} params.entity_id Source entity ID
 * @param {Object} params.relations Relations object with relation types as keys and arrays of target IDs as values
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

  // Insert new relations
  for (const relation_type in relations) {
    const target_entity_ids = relations[relation_type]

    if (!target_entity_ids || target_entity_ids.length === 0) continue

    log(`Adding ${target_entity_ids.length} '${relation_type}' relations`)

    const relations_data = target_entity_ids.map((target_entity_id) => ({
      source_entity_id: entity_id,
      target_entity_id,
      relation_type,
      created_at: relations.created_at || new Date()
    }))

    await db_client('entity_relations').insert(relations_data)
  }

  log(`Relations written successfully for entity: ${entity_id}`)
}

export default write_entity_relations_to_database
