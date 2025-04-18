import db from '#db'

/**
 * Fetch entity data by ID with optional related data
 *
 * @param {Object} params Entity fetching parameters
 * @param {string} params.entity_id Entity ID to fetch
 * @param {string} params.user_id User who owns the entity
 * @param {boolean} [params.include_relations=false] Whether to include relations
 * @param {boolean} [params.include_tags=false] Whether to include tags
 * @param {boolean} [params.include_type_data=false] Whether to include type-specific data
 * @returns {Promise<Object>} The entity data
 */
export async function fetch_entity_data({
  entity_id,
  user_id,
  include_relations = false,
  include_tags = false,
  include_type_data = false
}) {
  // Fetch the base entity
  const entity = await db('entities').where({ entity_id, user_id }).first()

  if (!entity) return null

  // Initialize result with base entity data
  const result = { ...entity }

  // Fetch tags if requested
  if (include_tags) {
    const tags = await fetch_entity_tags({ entity_id })
    result.tags = tags
  }

  // Fetch relations if requested
  if (include_relations) {
    const relations = await fetch_entity_relations({ entity_id })
    result.relations = relations
  }

  // Fetch type-specific data if requested
  if (include_type_data) {
    const type_data = await fetch_entity_type_data({
      entity_id,
      entity_type: entity.type
    })

    // Merge type-specific data with result
    Object.assign(result, type_data)
  }

  return result
}

/**
 * Fetch entity tags
 *
 * @param {Object} params Tag fetching parameters
 * @param {string} params.entity_id Entity ID
 * @returns {Promise<Array>} Array of tag objects
 */
export async function fetch_entity_tags({ entity_id }) {
  return db('entity_tags as et')
    .join('entities as e', 'et.tag_entity_id', 'e.entity_id')
    .where('et.entity_id', entity_id)
    .select(
      'e.entity_id as tag_id',
      'e.title as tag_name',
      db.raw('(SELECT color FROM tags WHERE entity_id = e.entity_id) as color')
    )
}

/**
 * Fetch entity relations
 *
 * @param {Object} params Relation fetching parameters
 * @param {string} params.entity_id Entity ID
 * @returns {Promise<Object>} Object with relations grouped by type
 */
export async function fetch_entity_relations({ entity_id }) {
  const relations = await db('entity_relations as er')
    .join('entities as e', 'er.target_entity_id', 'e.entity_id')
    .where('er.source_entity_id', entity_id)
    .select(
      'er.relation_type',
      'e.entity_id as target_id',
      'e.title as target_title',
      'e.type as target_type',
      'er.context'
    )

  // Group relations by relation_type
  const grouped_relations = {}
  relations.forEach((relation) => {
    if (!grouped_relations[relation.relation_type]) {
      grouped_relations[relation.relation_type] = []
    }
    grouped_relations[relation.relation_type].push({
      id: relation.target_id,
      title: relation.target_title,
      type: relation.target_type,
      context: relation.context
    })
  })

  return grouped_relations
}

/**
 * Fetch entity type-specific data
 *
 * @param {Object} params Type data fetching parameters
 * @param {string} params.entity_id Entity ID
 * @param {string} params.entity_type Entity type
 * @returns {Promise<Object>} Type-specific data
 */
export async function fetch_entity_type_data({ entity_id, entity_type }) {
  switch (entity_type) {
    case 'task':
      return db('tasks').where({ entity_id }).first()

    case 'tag':
      return db('tags').where({ entity_id }).first()

    case 'person':
      return db('persons').where({ entity_id }).first()

    case 'organization':
      return db('organizations').where({ entity_id }).first()

    case 'physical_item':
      return db('physical_items').where({ entity_id }).first()

    case 'digital_item':
      return db('digital_items').where({ entity_id }).first()

    case 'database':
      return db('database_tables').where({ entity_id }).first()

    default:
      return {}
  }
}

export default {
  fetch_entity_data,
  fetch_entity_tags,
  fetch_entity_relations,
  fetch_entity_type_data
}
