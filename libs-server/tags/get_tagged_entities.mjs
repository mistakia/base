import db from '#db'
import { fetch_entity_data } from '#libs-server/entities/index.mjs'

/**
 * Get all entities associated with a specific tag
 *
 * @param {Object} params - Parameters for retrieving tagged entities
 * @param {string} params.tag_id - The tag's entity ID
 * @param {string} params.user_id - The user ID who owns the entities
 * @param {boolean} params.archived - Whether to include archived entities (default: false)
 * @param {string[]} [params.entity_types] - Optional array of entity types to filter by
 * @returns {Promise<Object>} - Object with categorized entities
 */
export default async function get_tagged_entities({
  tag_id,
  user_id,
  archived = false,
  entity_types = null
}) {
  // Make sure the tag exists and belongs to this user
  const tag = await fetch_entity_data({
    entity_id: tag_id,
    user_id,
    include_type_data: true
  })

  if (!tag || tag.type !== 'tag') {
    return null
  }

  // Get all entity IDs with this tag
  const query = db('entity_tags as et')
    .join('entities as e', 'et.entity_id', 'e.entity_id')
    .where({
      'et.tag_entity_id': tag_id,
      'e.user_id': user_id
    })
    .select('e.entity_id', 'e.type')

  // Filter by archived status
  if (archived) {
    query.whereNotNull('e.archived_at')
  } else {
    query.whereNull('e.archived_at')
  }

  // Filter by entity types if specified
  if (entity_types && entity_types.length > 0) {
    query.whereIn('e.type', entity_types)
  }

  // Get all entity IDs with this tag
  const tagged_entities = await query

  // Group by type for parallel processing
  const entity_ids_by_type = {}
  tagged_entities.forEach((entity) => {
    if (!entity_ids_by_type[entity.type]) {
      entity_ids_by_type[entity.type] = []
    }
    entity_ids_by_type[entity.type].push(entity.entity_id)
  })

  // Initialize result with tag data
  const result = {
    tag
  }

  // Type mapping
  const type_mapping = {
    task: 'tasks',
    physical_item: 'physical_items',
    digital_item: 'digital_items',
    database: 'databases',
    person: 'persons',
    organization: 'organizations',
    tag: 'tags',
    activity: 'activities',
    database_item: 'database_items',
    database_view: 'database_views',
    guideline: 'guidelines',
    physical_location: 'physical_locations',
    text: 'texts',
    type_definition: 'type_definitions',
    type_extension: 'type_extensions'
  }

  // Initialize empty arrays for common entity types
  Object.values(type_mapping).forEach((plural_type) => {
    result[plural_type] = []
  })

  // Fetch entities by type in parallel
  const fetch_promises = Object.entries(entity_ids_by_type).map(
    async ([type, ids]) => {
      const entities = await Promise.all(
        ids.map((id) =>
          fetch_entity_data({
            entity_id: id,
            user_id,
            include_type_data: true
          })
        )
      )

      const result_key = type_mapping[type]
      result[result_key] = entities.filter((e) => e !== null)
    }
  )

  // Wait for all fetches to complete
  await Promise.all(fetch_promises)

  return result
}
