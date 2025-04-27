import db from '#db'

/**
 * Add entity relations to frontmatter for export
 *
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

/**
 * Add entity tags to frontmatter for export
 *
 * @param {String} entity_id Entity ID
 * @param {Object} frontmatter Frontmatter to modify
 */
export async function add_entity_tags(entity_id, frontmatter) {
  // Get all tags for this entity
  const tags = await db('entity_tags')
    .where('entity_tags.entity_id', entity_id)
    .join('entities', 'entity_tags.tag_entity_id', 'entities.entity_id')
    .select('entities.title')

  // Initialize tags array if it doesn't exist
  if (!frontmatter.tags) {
    frontmatter.tags = []
  }

  // Add tags to frontmatter
  tags.forEach((tag) => {
    if (!frontmatter.tags.includes(tag.title)) {
      frontmatter.tags.push(tag.title)
    }
  })
}

/**
 * Add entity observations to frontmatter for export
 *
 * @param {String} entity_id Entity ID
 * @param {Object} frontmatter Frontmatter to modify
 */
export async function add_entity_observations(entity_id, frontmatter) {
  // Get all observations for this entity
  const observations = await db('entity_observations')
    .where({ entity_id })
    .select('category', 'content', 'context')

  // Initialize observations array if it doesn't exist
  if (!frontmatter.observations) {
    frontmatter.observations = []
  }

  // Format observations and add to frontmatter
  observations.forEach((observation) => {
    const observation_str = observation.context
      ? `${observation.category}: ${observation.content} (${observation.context})`
      : `${observation.category}: ${observation.content}`

    if (!frontmatter.observations.includes(observation_str)) {
      frontmatter.observations.push(observation_str)
    }
  })
}

/**
 * Add all relationship data to frontmatter for export
 *
 * @param {String} entity_id Entity ID
 * @param {Object} frontmatter Frontmatter to modify
 */
export async function add_all_entity_relationships(entity_id, frontmatter) {
  await add_entity_relations(entity_id, frontmatter)
  await add_entity_tags(entity_id, frontmatter)
  await add_entity_observations(entity_id, frontmatter)
}

export default {
  add_entity_relations,
  add_entity_tags,
  add_entity_observations,
  add_all: add_all_entity_relationships
}
