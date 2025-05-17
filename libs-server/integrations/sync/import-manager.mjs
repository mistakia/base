import debug from 'debug'
import fs from 'fs'
import path from 'path'
import db from '#db'
import { create_content_identifier } from './sync-core.mjs'
import { write_file_to_filesystem } from '#libs-server/filesystem/write-file-to-filesystem.mjs'
import fs_promises from 'fs/promises'

import config from '#config'

const default_import_history_base_directory = path.join(
  config.user_base_directory,
  'import-history'
)

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
