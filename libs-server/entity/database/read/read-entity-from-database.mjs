import db from '#db'
import debug from 'debug'

const log = debug('entity:database:read')

/**
 * Reads an entity from the database with optional related data
 *
 * @param {Object} params Entity reading parameters
 * @param {string} params.entity_id Entity ID to fetch
 * @param {string} [params.user_id=null] Optional user ID for permission filtering
 * @param {boolean} [params.include_relations=false] Whether to include relations
 * @param {boolean} [params.include_tags=false] Whether to include tags
 * @param {Object} [params.trx=null] Optional transaction object
 * @returns {Promise<Object|null>} The entity data or null if not found
 */
export async function read_entity_from_database({
  entity_id,
  user_id = null,
  include_relations = false,
  include_tags = false,
  trx = null
}) {
  try {
    log(`Reading entity from database: ${entity_id}`)

    if (!entity_id) {
      throw new Error('Entity ID is required')
    }

    const db_client = trx || db

    // Build base query
    let query = db_client('entities').where({ entity_id })

    // Add user_id filter if provided
    if (user_id) {
      query = query.where({ user_id })
    }

    // Fetch the base entity
    const entity = await query.first()

    if (!entity) {
      log(`Entity not found: ${entity_id}`)
      return null
    }

    // Frontmatter already in JSON format, just assign it to properties
    entity.properties = entity.frontmatter

    // Initialize result with base entity data
    const result = {
      ...entity,
      success: true
    }

    // Fetch relations if requested
    if (include_relations) {
      const relations = await fetch_entity_relations({
        entity_id,
        db_client
      })
      result.relations = relations
    }

    // Fetch tags if requested
    if (include_tags) {
      const tags = await fetch_entity_tags({
        entity_id,
        db_client
      })
      result.tags = tags
    }

    // Always fetch type-specific data
    const type_data = await fetch_entity_type_data({
      entity_id,
      entity_type: entity.type,
      db_client
    })

    // Merge type-specific data with result
    Object.assign(result, type_data)

    log(`Successfully read entity ${entity_id} from database`)
    return result
  } catch (error) {
    log(`Error reading entity ${entity_id} from database:`, error)
    throw error
  }
}

/**
 * Fetches relations for an entity
 *
 * @param {Object} params - Function parameters
 * @param {string} params.entity_id - The entity ID
 * @param {Object} params.db_client - Database client
 * @returns {Promise<Object>} - Relations grouped by relation type
 */
async function fetch_entity_relations({ entity_id, db_client }) {
  const relations = await db_client('entity_relations')
    .where({ source_entity_id: entity_id })
    .select('relation_type', 'target_entity_id')

  // Group relations by relation_type
  const grouped_relations = {}

  for (const relation of relations) {
    if (!grouped_relations[relation.relation_type]) {
      grouped_relations[relation.relation_type] = []
    }
    grouped_relations[relation.relation_type].push(relation.target_entity_id)
  }

  return grouped_relations
}

/**
 * Fetches tags for an entity
 *
 * @param {Object} params - Function parameters
 * @param {string} params.entity_id - The entity ID
 * @param {Object} params.db_client - Database client
 * @returns {Promise<string[]>} - Array of tag titles
 */
async function fetch_entity_tags({ entity_id, db_client }) {
  const tags = await db_client('entity_tags')
    .join('entities', 'entity_tags.tag_entity_id', '=', 'entities.entity_id')
    .where({ 'entity_tags.entity_id': entity_id })
    .select('entities.title')

  return tags.map((tag) => tag.title)
}

/**
 * Fetches type-specific data for an entity
 *
 * @param {Object} params - Function parameters
 * @param {string} params.entity_id - The entity ID
 * @param {string} params.entity_type - The entity type
 * @param {Object} params.db_client - Database client
 * @returns {Promise<Object>} - Type-specific data
 */
async function fetch_entity_type_data({ entity_id, entity_type, db_client }) {
  switch (entity_type) {
    case 'task':
      return db_client('tasks').where({ entity_id }).first()

    case 'activity':
      return db_client('activities').where({ entity_id }).first()

    case 'guideline':
      return db_client('guidelines').where({ entity_id }).first()

    case 'person':
      return db_client('persons').where({ entity_id }).first()

    case 'organization':
      return db_client('organizations').where({ entity_id }).first()

    case 'physical_item':
      return db_client('physical_items').where({ entity_id }).first()

    case 'physical_location':
      return db_client('physical_locations').where({ entity_id }).first()

    case 'digital_item':
      return db_client('digital_items').where({ entity_id }).first()

    case 'database_table':
      return db_client('database_tables').where({ entity_id }).first()

    case 'database_table_view':
      return db_client('database_table_views').where({ entity_id }).first()

    case 'database_table_item':
      return db_client('database_table_items').where({ entity_id }).first()

    case 'tag':
      return db_client('tags').where({ entity_id }).first()

    default:
      return {}
  }
}
