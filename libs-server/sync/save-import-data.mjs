import debug from 'debug'
import fs_promises from 'fs/promises'
import path from 'path'

import { write_file_to_filesystem } from '#libs-server/filesystem/write-file-to-filesystem.mjs'
import { create_content_identifier } from '#libs-server/utils/create-content-identifier.mjs'
import { get_import_directory_paths } from '#libs-server/sync/get-import-directory-paths.mjs'

const log = debug('sync:save-import-data')

/**
 * Save raw import data to disk and record the import
 *
 * @param {Object} options - Function options
 * @param {string} options.external_system - Name of external system
 * @param {string} options.entity_id - Entity UUID
 * @param {Object} options.raw_data - Raw import data
 * @param {Object} [options.processed_data=null] - Processed/normalized data
 * @param {string} [options.import_history_base_directory=null] - Optional override for base directory
 * @param {string} [options.import_source=null] - Optional import source identifier
 * @returns {Promise<Object>} Import info object
 */
export async function save_import_data({
  external_system,
  entity_id,
  raw_data,
  processed_data = null,
  import_history_base_directory = null,
  import_source = null
}) {
  try {
    // Get directory paths
    const dir_paths = get_import_directory_paths({
      external_system,
      entity_id,
      import_history_base_directory,
      import_source
    })

    // Create directories if they don't exist
    await fs_promises.mkdir(dir_paths.raw_data_directory, { recursive: true })
    if (processed_data) {
      await fs_promises.mkdir(dir_paths.processed_data_directory, {
        recursive: true
      })
    }

    // Generate content identifiers
    const raw_data_cid = await create_content_identifier(raw_data)

    // Create timestamped filenames
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const raw_filename = `${timestamp}_${raw_data_cid}.json`
    const raw_filepath = path.join(dir_paths.raw_data_directory, raw_filename)

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
        dir_paths.processed_data_directory,
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
