import debug from 'debug'
import db from '#db'

const log = debug('sync:core:entity-finder')

/**
 * Get entity data with extensions
 *
 * @param {Object} entity - Entity object
 * @returns {Promise<Object>} Complete entity data
 */
export async function get_entity_data_with_extensions(entity) {
  // Start with base entity data
  const entity_data = {
    entity_id: entity.entity_id,
    title: entity.title,
    description: entity.description,
    created_at: entity.created_at,
    updated_at: entity.updated_at,
    type: entity.type
  }

  // Add frontmatter data if available
  if (entity.frontmatter) {
    try {
      const frontmatter = JSON.parse(entity.frontmatter)
      Object.assign(entity_data, frontmatter)
    } catch (error) {
      log(
        `Error parsing frontmatter for entity ${entity.entity_id}: ${error.message}`
      )
    }
  }

  // Get entity metadata
  const metadata = await db('entity_metadata')
    .where({ entity_id: entity.entity_id })
    .select('key', 'value')

  // Add metadata to entity data
  for (const meta of metadata) {
    entity_data[meta.key] = meta.value
  }

  return entity_data
}
