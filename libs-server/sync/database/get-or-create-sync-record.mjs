import { get_sync_record } from './get-sync-record.mjs'
import { create_sync_record } from './create-sync-record.mjs'

/**
 * Get or create a sync record for an entity and external system
 *
 * @param {Object} options - Function options
 * @param {string} options.entity_id - Entity UUID
 * @param {string} options.external_system - Name of external system
 * @param {string} options.external_id - ID in external system
 * @param {Object} [options.trx=null] - Optional transaction object
 * @returns {Object} Sync record
 */
export async function get_or_create_sync_record({
  entity_id,
  external_system,
  external_id,
  trx = null
}) {
  // Check if record exists
  const existing_sync_record = await get_sync_record({
    entity_id,
    external_system,
    trx
  })

  if (existing_sync_record) {
    return existing_sync_record
  }

  // Create new sync record
  return await create_sync_record({
    entity_id,
    external_system,
    external_id,
    sync_status: 'new',
    trx
  })
}