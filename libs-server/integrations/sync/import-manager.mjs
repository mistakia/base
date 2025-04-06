import debug from 'debug'
import fs from 'fs'
import path from 'path'
import db from '#db'
import { create_content_identifier } from './sync-core.mjs'

const log = debug('sync:import-manager')

/**
 * Get the directory path for storing import data
 *
 * @param {Object} options - Function options
 * @param {string} options.external_system - Name of external system
 * @param {string} options.entity_id - Entity UUID
 * @param {string} options.import_history_base_directory - Optional override for base directory
 * @returns {Object} Object with raw and processed paths
 */
export function get_import_directory_paths({
  external_system,
  entity_id,
  import_history_base_directory
}) {
  const base_dir =
    import_history_base_directory ||
    process.env.IMPORT_HISTORY_DIR ||
    './data/import_history'
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
 * @param {Object} options.processed_data - Processed/normalized data
 * @param {string} options.import_history_base_directory - Optional override for base directory
 * @returns {Object} Import info object
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
    fs.mkdirSync(dir_paths.raw_path, { recursive: true })
    if (processed_data) {
      fs.mkdirSync(dir_paths.processed_path, { recursive: true })
    }

    // Generate content identifiers
    const raw_data_cid = await create_content_identifier(raw_data)

    // Create timestamped filenames
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const raw_filename = `${timestamp}_${raw_data_cid}.json`
    const raw_filepath = path.join(dir_paths.raw_path, raw_filename)

    // Write raw data to file
    fs.writeFileSync(raw_filepath, JSON.stringify(raw_data, null, 2))
    log(`Saved raw import data to ${raw_filepath}`)

    let processed_filepath = null
    if (processed_data) {
      const processed_data_cid = await create_content_identifier(processed_data)
      const processed_filename = `${timestamp}_${processed_data_cid}.json`
      processed_filepath = path.join(
        dir_paths.processed_path,
        processed_filename
      )

      // Write processed data to file
      fs.writeFileSync(
        processed_filepath,
        JSON.stringify(processed_data, null, 2)
      )
      log(`Saved processed import data to ${processed_filepath}`)
    }

    return {
      raw_filepath,
      processed_filepath,
      raw_data_cid,
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
 * @returns {Object} History record
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
 * Find previous import files for entity
 *
 * @param {Object} options - Function options
 * @param {string} options.external_system - Name of external system
 * @param {string} options.entity_id - Entity UUID
 * @param {string} options.import_history_base_directory - Optional override for base directory
 * @returns {Object|null} Previous import info
 */
export function find_previous_import_files({
  external_system,
  entity_id,
  import_history_base_directory = null
}) {
  try {
    const dir_paths = get_import_directory_paths({
      external_system,
      entity_id,
      import_history_base_directory
    })

    // Check if raw directory exists
    if (!fs.existsSync(dir_paths.raw_path)) return null

    // List all files in the raw directory
    const raw_files = fs
      .readdirSync(dir_paths.raw_path)
      .filter((file) => file.endsWith('.json'))
      .sort() // Sort by filename (includes timestamp)
      .reverse() // Most recent first

    if (raw_files.length === 0) return null

    const latest_raw_file = raw_files[0]
    const raw_filepath = path.join(dir_paths.raw_path, latest_raw_file)

    // Check for matching processed file if processed directory exists
    let processed_filepath = null
    let processed_data = null
    if (fs.existsSync(dir_paths.processed_path)) {
      const timestamp = latest_raw_file.split('_')[0]
      const processed_files = fs
        .readdirSync(dir_paths.processed_path)
        .filter((file) => file.startsWith(timestamp) && file.endsWith('.json'))

      if (processed_files.length > 0) {
        processed_filepath = path.join(
          dir_paths.processed_path,
          processed_files[0]
        )
        processed_data = JSON.parse(fs.readFileSync(processed_filepath, 'utf8'))
      }
    }

    // Extract CID from filename
    const cid_match = latest_raw_file.match(/.*_(.+)\.json$/)
    const import_cid = cid_match ? cid_match[1] : null

    return {
      raw_filepath,
      processed_filepath,
      import_cid,
      raw_data: JSON.parse(fs.readFileSync(raw_filepath, 'utf8')),
      processed_data
    }
  } catch (error) {
    log(`Error finding previous import: ${error.message}`)
    return null
  }
}

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
