import db from '#db'

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
  const tag = await db('entities')
    .where({
      entity_id: tag_id,
      user_id,
      type: 'tag'
    })
    .first()

  if (!tag) {
    return null
  }

  // Base query to get all entities with this tag
  const base_query = db('entities as e')
    .join('entity_tags as et', 'e.entity_id', 'et.entity_id')
    .where({
      'et.tag_entity_id': tag_id,
      'e.user_id': user_id
    })
    .select('e.*', 'e.entity_id as entity_id')

  // Filter by archived status
  if (archived) {
    base_query.whereNotNull('e.archived_at')
  } else {
    base_query.whereNull('e.archived_at')
  }

  // Filter by entity types if specified
  if (entity_types && entity_types.length > 0) {
    base_query.whereIn('e.type', entity_types)
  }

  // Get all entities with this tag
  const entities = await base_query

  // Fetch specific data for each entity type
  const tasks = await get_task_details(
    entities.filter((e) => e.type === 'task').map((e) => e.entity_id)
  )
  const physical_items = await get_physical_item_details(
    entities.filter((e) => e.type === 'physical_item').map((e) => e.entity_id)
  )
  const digital_items = await get_digital_item_details(
    entities.filter((e) => e.type === 'digital_item').map((e) => e.entity_id)
  )
  const database_tables = await get_database_table_details(
    entities.filter((e) => e.type === 'database').map((e) => e.entity_id)
  )

  return {
    tag,
    tasks,
    physical_items,
    digital_items,
    database_tables,
    other_entities: entities.filter(
      (e) =>
        !['task', 'physical_item', 'digital_item', 'database'].includes(e.type)
    )
  }
}

/**
 * Helper function to get task details
 */
async function get_task_details(task_ids) {
  if (!task_ids.length) return []

  return db('entities as e')
    .join('tasks as t', 'e.entity_id', 't.entity_id')
    .whereIn('e.entity_id', task_ids)
    .select(
      'e.entity_id as task_id',
      'e.title',
      'e.description',
      'e.user_id',
      'e.created_at',
      'e.updated_at',
      't.status',
      't.priority',
      't.finish_by',
      't.planned_start',
      't.planned_finish'
    )
}

/**
 * Helper function to get physical item details
 */
async function get_physical_item_details(item_ids) {
  if (!item_ids.length) return []

  return db('entities as e')
    .join('physical_items as p', 'e.entity_id', 'p.entity_id')
    .whereIn('e.entity_id', item_ids)
    .select(
      'e.entity_id as physical_item_id',
      'e.title',
      'e.description',
      'e.user_id',
      'e.created_at',
      'e.updated_at',
      'p.storage_location',
      'p.current_location',
      'p.target_location',
      'p.importance',
      'p.frequency_of_use'
    )
}

/**
 * Helper function to get digital item details
 */
async function get_digital_item_details(item_ids) {
  if (!item_ids.length) return []

  return db('entities as e')
    .join('digital_items as d', 'e.entity_id', 'd.entity_id')
    .whereIn('e.entity_id', item_ids)
    .select(
      'e.entity_id as digital_item_id',
      'e.title',
      'e.description',
      'e.user_id',
      'e.created_at',
      'e.updated_at',
      'd.file_mime_type',
      'd.file_uri',
      'd.file_size'
    )
}

/**
 * Helper function to get database table details
 */
async function get_database_table_details(table_ids) {
  if (!table_ids.length) return []

  return db('entities as e')
    .join('database_tables as dt', 'e.entity_id', 'dt.entity_id')
    .whereIn('e.entity_id', table_ids)
    .select(
      'e.entity_id as database_table_id',
      'e.title',
      'e.description',
      'e.user_id',
      'e.created_at',
      'e.updated_at',
      'dt.table_name',
      'dt.table_description'
    )
}
