import db from '#db'

/**
 * Updates an entity
 *
 * @param {Object} params Entity update parameters
 * @param {string} params.entity_id Entity ID to update
 * @param {string} [params.title] Optional new title
 * @param {string} [params.description] Optional new description
 * @param {Object} [params.trx=null] Optional transaction object
 * @returns {Promise<void>}
 */
export async function update_entity({
  entity_id,
  title,
  description,
  trx = null
}) {
  const db_client = trx || db

  const updates = {}
  if (title !== undefined) updates.title = title
  if (description !== undefined) updates.description = description

  if (Object.keys(updates).length > 0) {
    updates.updated_at = new Date()
    await db_client('entities').where({ entity_id }).update(updates)
  }
}

/**
 * Deletes entity relations
 *
 * @param {Object} params Relation deletion parameters
 * @param {string} params.source_entity_id Source entity ID
 * @param {string} params.relation_type Relation type
 * @param {string} [params.target_entity_type] Optional target entity type filter
 * @param {string} [params.target_entity_id] Optional specific target entity ID
 * @param {Object} [params.trx=null] Optional transaction object
 * @returns {Promise<void>}
 */
export async function delete_entity_relations({
  source_entity_id,
  relation_type,
  target_entity_type,
  target_entity_id,
  trx = null
}) {
  const db_client = trx || db

  let query = db_client('entity_relations').where({
    source_entity_id,
    relation_type
  })

  if (target_entity_id) {
    query = query.where({ target_entity_id })
  }

  if (target_entity_type) {
    query = query.whereIn('target_entity_id', function () {
      this.select('entity_id')
        .from('entities')
        .where('type', target_entity_type)
    })
  }

  await query.delete()
}

/**
 * Deletes entity tags
 *
 * @param {Object} params Tag deletion parameters
 * @param {string} params.entity_id Entity ID
 * @param {Object} [params.trx=null] Optional transaction object
 * @returns {Promise<void>}
 */
export async function delete_entity_tags({ entity_id, trx = null }) {
  const db_client = trx || db

  await db_client('entity_tags').where({ entity_id }).delete()
}
