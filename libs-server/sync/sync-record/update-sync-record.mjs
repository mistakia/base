import db from '#db'
import debug from 'debug'
import { get_sync_record } from './get-sync-record.mjs'

const log = debug('sync:database:update-sync-record')

/**
 * Updates an existing sync record in the database
 *
 * @param {Object} options - Function options
 * @param {string} options.entity_id - The entity ID
 * @param {string} options.external_system - The external system identifier
 * @param {string} [options.external_id] - The ID in the external system
 * @param {Date} [options.last_synced_at=null] - Update the last synced timestamp
 * @param {string} [options.sync_status] - Update sync status
 * @param {Object} [options.trx=null] - Optional transaction object
 * @returns {Promise<Object>} - The updated sync record
 */
export async function update_sync_record({
  entity_id,
  external_system,
  external_id,
  last_synced_at = null,
  sync_status,
  trx = null
}) {
  try {
    log(
      `Updating sync record for ${external_system}:${external_id || 'unknown'} with entity ${entity_id}`
    )

    if (!entity_id || !external_system) {
      throw new Error('Entity ID and external system are required')
    }

    const db_client = trx || db

    // Find the existing record
    const existing_record = await get_sync_record({
      entity_id,
      external_system,
      external_id,
      trx: db_client
    })

    if (!existing_record) {
      throw new Error(
        `No sync record found for entity_id ${entity_id} and external_system ${external_system}`
      )
    }

    const updates = {}

    // Only update fields that are provided
    if (external_id) {
      updates.external_id = external_id
    }

    if (last_synced_at) {
      updates.last_synced_at = last_synced_at
    } else {
      // Default to current time if not provided
      updates.last_synced_at = new Date()
    }

    if (sync_status) {
      updates.sync_status = sync_status
    }

    // Only update if there are changes
    if (Object.keys(updates).length === 0) {
      log('No changes to update')
      return existing_record
    }

    const [updated_record] = await db_client('entity_sync_records')
      .where({ sync_id: existing_record.sync_id })
      .update(updates)
      .returning('*')

    log(`Updated sync record with ID: ${updated_record.sync_id}`)
    return updated_record
  } catch (error) {
    log(`Error updating sync record: ${error.message}`)
    throw error
  }
}
