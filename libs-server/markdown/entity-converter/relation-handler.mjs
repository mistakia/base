import debug from 'debug'
import db from '#db'

const log = debug('markdown:entity_converter:relations')

/**
 * Handle entity relations
 * @param {Object} trx Database transaction
 * @param {String} entity_id Source entity ID
 * @param {String} user_id User ID
 * @param {Object} extracted Extracted data
 */
export async function handle_relations(trx, entity_id, user_id, extracted) {
  // Process canonical relations
  await process_entity_relations(trx, entity_id, user_id, extracted)

  // Process tags
  await process_entity_tags(trx, entity_id, user_id, extracted)

  // Process observations
  await process_entity_observations(trx, entity_id, extracted)
}

/**
 * Process canonical entity relations
 * @param {Object} trx Database transaction
 * @param {String} entity_id Source entity ID
 * @param {String} user_id User ID
 * @param {Object} extracted Extracted data
 */
async function process_entity_relations(trx, entity_id, user_id, extracted) {
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
  const target_titles = extracted.relations.map(
    (relation) => relation.target_title
  )

  // Batch find all target entities
  const target_entities = await trx('entities')
    .where({ user_id })
    .whereIn('title', target_titles)
    .select(['entity_id', 'title'])

  // Create a map of title to entity_id for quick lookup
  const entity_map = {}
  target_entities.forEach((entity) => {
    entity_map[entity.title] = entity.entity_id
  })

  // Prepare batched inserts
  const relations_with_targets = []

  extracted.relations.forEach((relation) => {
    if (entity_map[relation.target_title]) {
      relations_with_targets.push({
        source_entity_id: entity_id,
        target_entity_id: entity_map[relation.target_title],
        relation_type: relation.relation_type,
        context: relation.context,
        created_at: new Date()
      })
    } else {
      // Skip relations without target entities
      log(
        `Warning: Could not find target entity with title: ${relation.target_title}`
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
 * Process entity tags
 * @param {Object} trx Database transaction
 * @param {String} entity_id Source entity ID
 * @param {String} user_id User ID
 * @param {Object} extracted Extracted data
 */
async function process_entity_tags(trx, entity_id, user_id, extracted) {
  if (!extracted.tags || extracted.tags.length === 0) return

  // Process each tag
  for (const tag of extracted.tags) {
    // Find or create the tag entity
    const tag_entity_id = await find_or_create_tag(trx, user_id, tag.name)

    // Create tag relation if tag exists
    if (tag_entity_id) {
      // Check if relation already exists
      const existing_relation = await trx('entity_tags')
        .where({
          entity_id,
          tag_entity_id
        })
        .first()

      if (!existing_relation) {
        await trx('entity_tags').insert({
          entity_id,
          tag_entity_id
        })
      }
    }
  }
}

/**
 * Find or create a tag entity
 * @param {Object} trx Database transaction
 * @param {String} user_id User ID
 * @param {String} tag_name Tag name
 * @returns {String} The tag entity ID
 */
async function find_or_create_tag(trx, user_id, tag_name) {
  // Look for existing tag
  const existing_tag = await trx('entities')
    .where({
      type: 'tag',
      user_id,
      title: tag_name
    })
    .first()

  if (existing_tag) {
    return existing_tag.entity_id
  }

  // Create new tag entity
  const [new_tag] = await trx('entities')
    .insert({
      title: tag_name,
      type: 'tag',
      description: `Tag: ${tag_name}`,
      user_id,
      created_at: new Date(),
      updated_at: new Date()
    })
    .returning('entity_id')

  const tag_entity_id = new_tag.entity_id

  // Add to tags table
  await trx('tags').insert({
    entity_id: tag_entity_id,
    color: null // Default color
  })

  return tag_entity_id
}

/**
 * Process entity observations
 * @param {Object} trx Database transaction
 * @param {String} entity_id Source entity ID
 * @param {Object} extracted Extracted data
 */
async function process_entity_observations(trx, entity_id, extracted) {
  if (!extracted.observations || extracted.observations.length === 0) return

  // Insert observations
  const observations = extracted.observations.map((observation) => ({
    entity_id,
    category: observation.category,
    content: observation.content,
    context: observation.context,
    created_at: new Date()
  }))

  // Clear existing observations
  await trx('entity_observations').where({ entity_id }).delete()

  // Insert new observations
  await trx('entity_observations').insert(observations)
}

/**
 * Add entity relations to frontmatter
 * @param {String} entity_id Entity ID
 * @param {Object} frontmatter Frontmatter to modify
 */
export async function add_entity_relations(entity_id, frontmatter) {
  // Get all relations for this entity
  const relations = await db('entity_relations')
    .where('source_entity_id', entity_id)
    .join('entities', 'entity_relations.target_entity_id', 'entities.entity_id')
    .select(
      'entity_relations.relation_type',
      'entities.title',
      'entity_relations.context'
    )

  // Initialize relations array if it doesn't exist
  if (!frontmatter.relations) {
    frontmatter.relations = []
  }

  // Process all relations and add them to the relations array
  relations.forEach((relation) => {
    const relation_str = relation.context
      ? `${relation.relation_type} [[${relation.title}]] (${relation.context})`
      : `${relation.relation_type} [[${relation.title}]]`

    if (!frontmatter.relations.includes(relation_str)) {
      frontmatter.relations.push(relation_str)
    }
  })
}
