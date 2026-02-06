import fs from 'fs'
import path from 'path'
import debug from 'debug'

import { get_import_directory_paths } from '#libs-server/sync/index.mjs'

const log = debug('sync:history:find-previous-import-files')

/**
 * Find previous import files for entity
 *
 * @param {Object} options - Function options
 * @param {string} options.external_system - Name of external system
 * @param {string} options.entity_id - Entity UUID
 * @param {string} [options.import_history_base_directory=null] - Optional override for base directory
 * @param {string} [options.import_source=null] - Optional import source identifier
 * @returns {Promise<Object|null>} Previous import info
 */
export async function find_previous_import_files({
  external_system,
  entity_id,
  import_history_base_directory = null,
  import_source = null
}) {
  try {
    const dir_paths = get_import_directory_paths({
      external_system,
      entity_id,
      import_history_base_directory,
      import_source
    })

    // Check if raw directory exists
    if (!fs.existsSync(dir_paths.raw_data_directory)) return null

    // List all files in the raw directory
    const raw_files = fs
      .readdirSync(dir_paths.raw_data_directory)
      .filter((file) => file.endsWith('.json'))
      .sort() // Sort by filename (includes timestamp)
      .reverse() // Most recent first

    if (raw_files.length === 0) return null

    const latest_raw_file = raw_files[0]
    const raw_filepath = path.join(
      dir_paths.raw_data_directory,
      latest_raw_file
    )
    let raw_data
    try {
      raw_data = JSON.parse(fs.readFileSync(raw_filepath, 'utf8'))
    } catch (parse_error) {
      log(`Failed to parse JSON from ${raw_filepath}: ${parse_error.message}`)
      return null
    }

    // Find most recent processed file (regardless of timestamp)
    let processed_filepath = null
    let processed_data = null
    if (fs.existsSync(dir_paths.processed_data_directory)) {
      const processed_files = fs
        .readdirSync(dir_paths.processed_data_directory)
        .filter((file) => file.endsWith('.json'))
        .sort() // Sort by filename (includes timestamp)
        .reverse() // Most recent first

      if (processed_files.length > 0) {
        processed_filepath = path.join(
          dir_paths.processed_data_directory,
          processed_files[0]
        )
        try {
          processed_data = JSON.parse(
            fs.readFileSync(processed_filepath, 'utf8')
          )
        } catch (parse_error) {
          log(
            `Failed to parse JSON from ${processed_filepath}: ${parse_error.message}`
          )
          // Continue without processed data - raw data is still valid
        }
      }
    }

    return {
      raw_filepath,
      processed_filepath,
      raw_data,
      processed_data,
      timestamp: latest_raw_file.split('_')[0].replace(/-/g, ':')
    }
  } catch (error) {
    log(`Error finding previous import files: ${error.message}`)
    return null
  }
}
