import debug from 'debug'
import db from '#db'

const log = debug('sync:core:entity-finder')

/**
 * Find entity by external ID
 *
 * @param {Object} options - Function options
 * @param {string} options.external_system - Name of external system
 * @param {string} options.external_id - ID in external system
 * @returns {Promise<Object|null>} Entity object or null
 */
export async function find_entity_by_external_id({
  external_system,
  external_id
}) {
  try {
    const formatted_external_id = `${external_system}:${external_id}`
    log(`Looking for entity with external ID ${formatted_external_id}`)

    // Try to find via entity_metadata
    const metadata_record = await db('entity_metadata')
      .where({
        key: 'external_id',
        value: formatted_external_id
      })
      .first()

    if (!metadata_record) {
      log('No entity found with this external ID in metadata')
      return null
    }

    // Get the entity
    const entity = await db('entities')
      .where({ entity_id: metadata_record.entity_id })
      .first()

    if (!entity) {
      log(`Entity ${metadata_record.entity_id} not found in entities table`)
      return null
    }

    return entity
  } catch (error) {
    log(`Error finding entity by external ID: ${error.message}`)
    throw error
  }
}

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
