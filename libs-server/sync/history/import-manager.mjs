import debug from 'debug'
import fs from 'fs'
import path from 'path'
import db from '#db'
import fs_promises from 'fs/promises'
import { write_file_to_filesystem } from '#libs-server/filesystem/write-file-to-filesystem.mjs'
import { create_content_identifier } from '../core/content-identifier.mjs'
import config from '#config'

const default_import_history_base_directory = path.join(
  config.user_base_directory || process.cwd(),
  'import-history'
)

const log = debug('sync:history:import-manager')

/**
 * Get the directory path for storing import data
 *
 * @param {Object} options - Function options
 * @param {string} options.external_system - Name of external system
 * @param {string} options.entity_id - Entity UUID
 * @param {string} [options.import_history_base_directory] - Optional override for base directory
 * @returns {Object} Object with raw and processed paths
 */
export function get_import_directory_paths({
  external_system,
  entity_id,
  import_history_base_directory
}) {
  const base_dir =
    import_history_base_directory || default_import_history_base_directory
  const system_dir = path.join(base_dir, external_system)
  const entity_dir = path.join(system_dir, entity_id)

  return {
    base_path: base_dir,
    system_path: system_dir,
    entity_path: entity_dir,
    raw_path: path.join(entity_dir, 'raw'),
    processed_path: path.join(entity_dir, 'processed')
  }
}

/**
 * Save raw import data to disk and record the import
 *
 * @param {Object} options - Function options
 * @param {string} options.external_system - Name of external system
 * @param {string} options.entity_id - Entity UUID
 * @param {Object} options.raw_data - Raw import data
 * @param {Object} [options.processed_data=null] - Processed/normalized data
 * @param {string} [options.import_history_base_directory=null] - Optional override for base directory
 * @returns {Promise<Object>} Import info object
 */
export async function save_import_data({
  external_system,
  entity_id,
  raw_data,
  processed_data = null,
  import_history_base_directory = null
}) {
  try {
    // Get directory paths
    const dir_paths = get_import_directory_paths({
      external_system,
      entity_id,
      import_history_base_directory
    })

    // Create directories if they don't exist
    await fs_promises.mkdir(dir_paths.raw_path, { recursive: true })
    if (processed_data) {
      await fs_promises.mkdir(dir_paths.processed_path, { recursive: true })
    }

    // Generate content identifiers
    const raw_data_cid = await create_content_identifier(raw_data)

    // Create timestamped filenames
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const raw_filename = `${timestamp}_${raw_data_cid}.json`
    const raw_filepath = path.join(dir_paths.raw_path, raw_filename)

    // Write raw data to file
    await write_file_to_filesystem({
      absolute_path: raw_filepath,
      file_content: JSON.stringify(raw_data, null, 2)
    })
    log(`Saved raw import data to ${raw_filepath}`)

    let processed_filepath = null
    let processed_data_cid = null

    if (processed_data) {
      processed_data_cid = await create_content_identifier(processed_data)
      const processed_filename = `${timestamp}_${processed_data_cid}.json`
      processed_filepath = path.join(
        dir_paths.processed_path,
        processed_filename
      )

      // Write processed data to file
      await write_file_to_filesystem({
        absolute_path: processed_filepath,
        file_content: JSON.stringify(processed_data, null, 2)
      })
      log(`Saved processed import data to ${processed_filepath}`)
    }

    return {
      raw_filepath,
      processed_filepath,
      raw_data_cid,
      processed_data_cid,
      timestamp: new Date().toISOString()
    }
  } catch (error) {
    log(`Error saving import data: ${error.message}`)
    throw error
  }
}

/**
 * Record import in database history
 *
 * @param {Object} options - Function options
 * @param {string} options.sync_id - Sync record UUID
 * @param {Object} options.raw_data - Raw import data
 * @param {string} options.import_cid - Content ID of import
 * @returns {Promise<Object>} History record
 */
export async function record_import_history({ sync_id, raw_data, import_cid }) {
  // Check if we already have this import
  const existing_history = await db('sync_conflicts')
    .where({
      sync_id,
      import_cid
    })
    .first()

  if (existing_history) {
    log(`Import ${import_cid} already recorded for sync ${sync_id}`)
    return existing_history
  }

  // Create history record
  const [history_record] = await db('sync_conflicts')
    .insert({
      sync_id,
      import_cid,
      conflicts: {}, // Empty initially
      status: 'new' // New import, not yet processed for conflicts
    })
    .returning('*')

  return history_record
}

/**
 * Get sync history for an entity
 *
 * @param {Object} options - Function options
 * @param {string} options.entity_id - Entity UUID
 * @param {string} [options.external_system=null] - Optional filter by external system
 * @returns {Promise<Array>} Array of sync history records
 */
export async function get_sync_history({ entity_id, external_system = null }) {
  try {
    let query = db('entity_sync_records')
      .where({ entity_id })
      .join(
        'sync_conflicts',
        'entity_sync_records.sync_id',
        'sync_conflicts.sync_id'
      )
      .select('*')
      .orderBy('sync_conflicts.created_at', 'desc')

    if (external_system) {
      query = query.where(
        'entity_sync_records.external_system',
        external_system
      )
    }

    return await query
  } catch (error) {
    log(`Error getting sync history: ${error.message}`)
    throw error
  }
}

/**
 * Find recent conflicts for an entity
 *
 * @param {Object} options - Function options
 * @param {string} options.entity_id - Entity UUID
 * @param {string} [options.external_system=null] - Optional filter by external system
 * @param {number} [options.limit=10] - Maximum number of records to return
 * @returns {Promise<Array>} Array of conflict records
 */
export async function find_recent_conflicts({
  entity_id,
  external_system = null,
  limit = 10
}) {
  try {
    let query = db('entity_sync_records')
      .where({ entity_id })
      .join(
        'sync_conflicts',
        'entity_sync_records.sync_id',
        'sync_conflicts.sync_id'
      )
      .where('sync_conflicts.status', 'pending')
      .select('*')
      .orderBy('sync_conflicts.created_at', 'desc')
      .limit(limit)

    if (external_system) {
      query = query.where(
        'entity_sync_records.external_system',
        external_system
      )
    }

    return await query
  } catch (error) {
    log(`Error finding recent conflicts: ${error.message}`)
    throw error
  }
}
