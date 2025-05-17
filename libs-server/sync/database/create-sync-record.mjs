import db from '#db'
import debug from 'debug'
import { v4 as uuid } from 'uuid'

const log = debug('sync:database:create-sync-record')

/**
 * Creates a sync record in the database to track external system integration sync state
 *
 * @param {Object} options - Function options
 * @param {string} options.entity_id - The entity ID to track
 * @param {string} options.external_system - The external system identifier (e.g., 'github')
 * @param {string} options.external_id - The ID in the external system
 * @param {Date} [options.last_synced_at=null] - When the entity was last synced
 * @param {string} [options.sync_status='active'] - Current sync status
 * @param {Object} [options.trx=null] - Optional transaction object
 * @returns {Promise<Object>} - The created sync record
 */
export async function create_sync_record({
  entity_id,
  external_system,
  external_id,
  last_synced_at = null,
  sync_status,
  trx = null
}) {
  try {
    log(
      `Creating sync record for ${external_system}:${external_id} with entity ${entity_id}`
    )

    if (!entity_id) {
      throw new Error('Entity ID is required')
    }

    if (!external_system) {
      throw new Error('External system identifier is required')
    }

    if (!external_id) {
      throw new Error('External ID is required')
    }

    const db_client = trx || db

    const sync_record = {
      sync_id: uuid(),
      entity_id,
      external_system,
      external_id,
      last_synced_at: last_synced_at || new Date(),
      sync_status
    }

    const [result] = await db_client('entity_sync_records')
      .insert(sync_record)
      .returning('*')

    log(`Created sync record with ID: ${result.sync_id}`)
    return result
  } catch (error) {
    log(`Error creating sync record: ${error.message}`)
    throw error
  }
}
