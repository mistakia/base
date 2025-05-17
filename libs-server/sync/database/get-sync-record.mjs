import db from '#db'
import debug from 'debug'

const log = debug('sync:database:get-sync-record')

/**
 * Retrieves a sync record from the database
 *
 * @param {Object} options - Function options
 * @param {string} [options.entity_id] - The entity ID to find sync records for
 * @param {string} [options.external_system] - The external system identifier
 * @param {string} [options.external_id] - The ID in the external system
 * @param {Object} [options.trx=null] - Optional transaction object
 * @returns {Promise<Object|null>} - The sync record or null if not found
 */
export async function get_sync_record({
  entity_id,
  external_system,
  external_id,
  trx = null
}) {
  try {
    log('Retrieving sync record')

    if (!entity_id && !(external_system && external_id)) {
      throw new Error(
        'Either entity_id or both external_system and external_id must be provided'
      )
    }

    const db_client = trx || db
    let query = db_client('entity_sync_records')

    if (entity_id) {
      query = query.where({ entity_id })
    }

    if (external_system && external_id) {
      query = query.where({
        external_system,
        external_id
      })
    }

    const record = await query.first()

    return record || null
  } catch (error) {
    log(`Error retrieving sync record: ${error.message}`)
    throw error
  }
}

/**
 * Checks if an entity has changed since last sync
 *
 * @param {Object} options - Function options
 * @param {string} options.entity_id - The entity ID to check
 * @param {Date} options.entity_updated_at - The entity's last update timestamp
 * @param {string} options.external_system - The external system identifier
 * @param {Object} [options.trx=null] - Optional transaction object
 * @returns {Promise<boolean>} - True if entity has changed since last sync
 */
export async function has_entity_changed_since_sync({
  entity_id,
  entity_updated_at,
  external_system,
  trx = null
}) {
  try {
    const sync_record = await get_sync_record({
      entity_id,
      external_system,
      trx
    })

    if (!sync_record) {
      return true // No sync record means it's changed (or new)
    }

    const last_synced = new Date(sync_record.last_synced_at)
    const entity_updated = new Date(entity_updated_at)

    return entity_updated > last_synced
  } catch (error) {
    log(`Error checking if entity changed: ${error.message}`)
    throw error
  }
}
