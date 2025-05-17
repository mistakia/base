import debug from 'debug'
import path from 'path'
import db from '#db'

import config from '#config'

const default_import_history_base_directory = path.join(
  config.user_base_directory,
  'import-history'
)

const log = debug('sync:import-manager')

/**
 * Get sync history from database
 *
 * @param {Object} options - Function options
 * @param {string} options.sync_id - Sync record UUID
 * @param {number} options.limit - Maximum number of records to return
 * @returns {Array} History records
 */
export async function get_sync_history({ sync_id, limit = 2 }) {
  return await db('sync_conflicts')
    .where({ sync_id })
    .orderBy('created_at', 'desc')
    .limit(limit)
}

/**
 * Find the most recent conflict record for an entity
 *
 * @param {Object} options - Function options
 * @param {string} options.entity_id - Entity UUID
 * @param {string} options.external_system - Name of external system
 * @returns {Object|null} Conflict record
 */
export async function find_recent_conflicts({ entity_id, external_system }) {
  // Get sync record
  const sync_record = await db('external_syncs')
    .where({
      entity_id,
      external_system
    })
    .first()

  if (!sync_record) return undefined

  // Find conflicts
  const conflicts = await db('sync_conflicts')
    .where({
      sync_id: sync_record.sync_id,
      status: 'pending'
    })
    .orderBy('created_at', 'desc')
    .first()

  return conflicts
}
