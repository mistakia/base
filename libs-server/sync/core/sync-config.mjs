import db from '#db'

/**
 * Get sync configuration for an entity and external system
 *
 * @param {Object} options - Function options
 * @param {string} options.entity_id - Entity UUID
 * @param {string} options.external_system - Name of external system
 * @returns {Promise<Object>} Sync configuration
 */
export async function get_entity_sync_config({ entity_id, external_system }) {
  // Get entity type
  const entity = await db('entities')
    .select('type')
    .where({ entity_id })
    .first()

  if (!entity) {
    throw new Error(`Entity ${entity_id} not found`)
  }

  // Get entity-specific config
  const entity_specific_config = await db('sync_configs')
    .where({
      entity_id,
      external_system
    })
    .first()

  if (entity_specific_config) {
    return entity_specific_config
  }

  // Get entity-type config
  const entity_type_config = await db('sync_configs')
    .where({
      entity_type: entity.type,
      external_system
    })
    .whereNull('entity_id')
    .first()

  if (entity_type_config) {
    return entity_type_config
  }

  // Create default config
  const default_field_strategies = {
    title: 'newest_wins',
    description: 'newest_wins',
    status: 'newest_wins',
    priority: 'newest_wins',
    start_by: 'newest_wins',
    finish_by: 'newest_wins',
    updated_at: 'newest_wins'
  }

  const [new_config] = await db('sync_configs')
    .insert({
      entity_type: entity.type,
      external_system,
      field_strategies: default_field_strategies
    })
    .returning('*')

  return new_config
}

/**
 * Get filesystem sync configuration for entity
 * This replicates the behavior of get_entity_sync_config but for filesystem entities
 *
 * @param {Object} options - Function options
 * @param {string} options.external_system - Name of external system
 * @param {string} [options.entity_type='task'] - Entity type
 * @returns {Object} Sync configuration with field strategies
 */
export function get_filesystem_sync_config({
  external_system,
  entity_type = 'task'
}) {
  // Default field strategies that match database defaults
  return {
    field_strategies: {
      title: 'newest_wins',
      description: 'newest_wins',
      status: 'newest_wins',
      priority: 'newest_wins',
      start_by: 'newest_wins',
      finish_by: 'newest_wins',
      updated_at: 'newest_wins'
    },
    external_system,
    entity_type
  }
}
