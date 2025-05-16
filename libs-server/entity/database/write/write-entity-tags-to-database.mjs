import debug from 'debug'

const log = debug('entity:database:write-tags')

/**
 * Write entity tags to database
 *
 * @param {Object} params Parameters
 * @param {string} params.entity_id Entity ID
 * @param {Array} params.tag_entity_ids Array of tag entity IDs
 * @param {Object} params.db_client Database client
 * @returns {Promise<void>}
 */
export async function write_entity_tags_to_database({
  entity_id,
  tag_entity_ids,
  db_client
}) {
  // Always remove existing tags for this entity
  await db_client('entity_tags').where({ entity_id }).delete()

  // Return early if tags is null, undefined, or empty
  if (!tag_entity_ids || tag_entity_ids.length === 0) {
    log(`No tags provided for entity: ${entity_id}, existing tags removed`)
    return
  }

  log(`Writing ${tag_entity_ids.length} tags for entity: ${entity_id}`)

  // Insert new tags
  const tag_relations = tag_entity_ids.map((tag_entity_id) => ({
    entity_id,
    tag_entity_id
  }))

  await db_client('entity_tags').insert(tag_relations)

  log(`Tags written successfully for entity: ${entity_id}`)
}

export default write_entity_tags_to_database
