import debug from 'debug'

const log = debug('markdown:entity_import:relations')

/**
 * Process all entity relations during import
 *
 * @param {Object} trx Database transaction
 * @param {String} entity_id Source entity ID
 * @param {String} user_id User ID
 * @param {Object} extracted Extracted data with relations, tags, etc.
 */
export async function process_entity_relations(
  trx,
  entity_id,
  user_id,
  extracted
) {
  if (!extracted) return

  // Process canonical relations
  await process_canonical_relations(trx, entity_id, user_id, extracted)

  // Process tags
  if (extracted.tags && extracted.tags.length > 0) {
    await process_entity_tags(trx, entity_id, user_id, extracted.tags)
  }

  // Process observations
  if (extracted.observations && extracted.observations.length > 0) {
    await process_entity_observations(trx, entity_id, extracted.observations)
  }
}

/**
 * Process canonical entity relations
 *
 * @param {Object} trx Database transaction
 * @param {String} entity_id Source entity ID
 * @param {String} user_id User ID
 * @param {Object} extracted Extracted data
 */
async function process_canonical_relations(trx, entity_id, user_id, extracted) {
  if (!extracted.relations || extracted.relations.length === 0) return

  // Get relation types to clear existing relations
  const relation_types = [
    ...new Set(extracted.relations.map((r) => r.relation_type))
  ]

  // Clear existing relations of these types for clean upsert
  await trx('entity_relations')
    .where({ source_entity_id: entity_id })
    .whereIn('relation_type', relation_types)
    .delete()

  // Get all target titles to find matching entities in one query
  const entity_paths = extracted.relations.map(
    (relation) => relation.entity_path
  )

  // Batch find all target entities
  // TODO fix this
  const target_entities = await trx('entities')
    .where({ user_id })
    .whereIn('title', entity_paths)
    .select(['entity_id', 'title'])

  // Create a map of title to entity_id for quick lookup
  const entity_map = {}
  target_entities.forEach((entity) => {
    entity_map[entity.title] = entity.entity_id
  })

  // Prepare batched inserts
  const relations_with_targets = []

  extracted.relations.forEach((relation) => {
    if (entity_map[relation.entity_path]) {
      relations_with_targets.push({
        source_entity_id: entity_id,
        target_entity_id: entity_map[relation.entity_path],
        relation_type: relation.relation_type,
        context: relation.context,
        created_at: new Date()
      })
    } else {
      // Skip relations without target entities
      log(
        `Warning: Could not find target entity with path: ${relation.entity_path}`
      )
    }
  })

  // Batch insert relations with targets
  if (relations_with_targets.length > 0) {
    await trx('entity_relations')
      .insert(relations_with_targets)
      .onConflict(['source_entity_id', 'target_entity_id', 'relation_type'])
      .merge()
  }
}

/**
 * Process entity tags during import
 *
 * @param {Object} trx Database transaction
 * @param {String} entity_id Source entity ID
 * @param {String} user_id User ID
 * @param {Array} tags Array of tag objects
 */
export async function process_entity_tags(trx, entity_id, user_id, tags) {
  // Clear existing tags
  await trx('entity_tags').where({ entity_id }).delete()

  // Collect all tag IDs for batch processing
  const tag_ids = tags.map((tag) => tag.tag_id)

  // First, find all existing tags in one query
  const existing_tags = await trx('entities')
    .join('tags', 'entities.entity_id', 'tags.entity_id')
    .where({
      'entities.user_id': user_id,
      'entities.type': 'tag'
    })
    .whereIn('entities.title', tag_ids)
    .select(['entities.entity_id', 'entities.title'])

  // Create a map of tag ID to entity_id for quick lookup
  const tag_map = {}
  existing_tags.forEach((tag) => {
    tag_map[tag.title] = tag.entity_id
  })

  // Determine which tags need to be created
  const tags_to_create = tag_ids.filter((id) => !tag_map[id])

  // Batch create new tags if needed
  if (tags_to_create.length > 0) {
    // Prepare batch insert data
    const now = new Date()
    const tag_entities_to_insert = tags_to_create.map((id) => ({
      title: id,
      type: 'tag',
      description: `Tag: ${id}`,
      user_id,
      created_at: now,
      updated_at: now
    }))

    // Insert all new tag entities at once
    const inserted_tags = await trx('entities')
      .insert(tag_entities_to_insert)
      .returning(['entity_id', 'title'])

    // Update our tag map and prepare data for tags table
    const tags_table_data = []
    inserted_tags.forEach((tag) => {
      tag_map[tag.title] = tag.entity_id
      tags_table_data.push({ entity_id: tag.entity_id })
    })

    // Batch insert into tags table
    if (tags_table_data.length > 0) {
      await trx('tags').insert(tags_table_data)
    }
  }

  // Prepare data for entity_tags linking table
  const entity_tags_data = tag_ids.map((id) => ({
    entity_id,
    tag_entity_id: tag_map[id]
  }))

  // Batch insert entity-tag relationships
  if (entity_tags_data.length > 0) {
    await trx('entity_tags')
      .insert(entity_tags_data)
      .onConflict(['entity_id', 'tag_entity_id'])
      .ignore()
  }
}

/**
 * Process entity observations during import
 *
 * @param {Object} trx Database transaction
 * @param {String} entity_id Source entity ID
 * @param {Array} observations Array of observation objects
 */
export async function process_entity_observations(
  trx,
  entity_id,
  observations
) {
  // Insert observations
  const observations_data = observations.map((observation) => ({
    entity_id,
    category: observation.category,
    content: observation.content,
    context: observation.context,
    created_at: new Date()
  }))

  // Clear existing observations
  await trx('entity_observations').where({ entity_id }).delete()

  // Insert new observations
  await trx('entity_observations').insert(observations_data)
}

export default {
  process_entity_relations,
  process_entity_tags,
  process_entity_observations
}
