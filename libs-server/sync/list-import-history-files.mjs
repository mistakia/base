import fs from 'fs'
import path from 'path'
import debug from 'debug'

import {
  get_import_directory_paths,
  get_system_import_directory_paths,
  get_base_import_directory_path
} from '#libs-server/sync/get-import-directory-paths.mjs'

const log = debug('sync:list-import-history-files')

/**
 * List import history files for entities
 *
 * @param {Object} options - Function options
 * @param {string} [options.external_system] - Filter by external system (github, notion)
 * @param {string} [options.entity_id] - Filter by specific entity ID
 * @param {string} [options.import_history_base_directory] - Optional override for base directory
 * @returns {Promise<Array>} Array of entity import history information
 */
export async function list_import_history_files({
  external_system = null,
  entity_id = null,
  import_history_base_directory = null
} = {}) {
  try {
    const results = []

    if (entity_id && external_system) {
      // List files for specific entity
      const entity_files = await list_entity_import_files({
        external_system,
        entity_id,
        import_history_base_directory
      })
      if (entity_files) {
        results.push(entity_files)
      }
    } else {
      // List files for all entities in system(s)
      const systems_to_process = external_system
        ? [external_system]
        : await get_available_external_systems(import_history_base_directory)

      for (const system of systems_to_process) {
        const system_entities = await list_system_import_files({
          external_system: system,
          import_history_base_directory
        })
        results.push(...system_entities)
      }
    }

    return results
  } catch (error) {
    log(`Error listing import history files: ${error.message}`)
    throw error
  }
}

/**
 * List import files for a specific entity
 *
 * @param {Object} options - Function options
 * @param {string} options.external_system - External system name
 * @param {string} options.entity_id - Entity UUID
 * @param {string} [options.import_history_base_directory] - Optional override for base directory
 * @returns {Promise<Object|null>} Entity import files info or null if not found
 */
async function list_entity_import_files({
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

    // Check if entity import directory exists
    if (!fs.existsSync(dir_paths.entity_import_directory)) {
      return null
    }

    const raw_files = []
    const processed_files = []

    // List raw files
    if (fs.existsSync(dir_paths.raw_data_directory)) {
      const raw_file_names = fs
        .readdirSync(dir_paths.raw_data_directory)
        .filter((file) => file.endsWith('.json'))
        .sort()
        .reverse() // Most recent first

      for (const filename of raw_file_names) {
        const filepath = path.join(dir_paths.raw_data_directory, filename)
        const stat = fs.statSync(filepath)
        const [timestamp_str, content_id] = filename
          .replace('.json', '')
          .split('_')

        raw_files.push({
          filename,
          filepath,
          timestamp: timestamp_str.replace(/-/g, ':'),
          content_id,
          size: stat.size,
          modified: stat.mtime
        })
      }
    }

    // List processed files
    if (fs.existsSync(dir_paths.processed_data_directory)) {
      const processed_file_names = fs
        .readdirSync(dir_paths.processed_data_directory)
        .filter((file) => file.endsWith('.json'))
        .sort()
        .reverse() // Most recent first

      for (const filename of processed_file_names) {
        const filepath = path.join(dir_paths.processed_data_directory, filename)
        const stat = fs.statSync(filepath)
        const [timestamp_str, content_id] = filename
          .replace('.json', '')
          .split('_')

        processed_files.push({
          filename,
          filepath,
          timestamp: timestamp_str.replace(/-/g, ':'),
          content_id,
          size: stat.size,
          modified: stat.mtime
        })
      }
    }

    return {
      external_system,
      entity_id,
      entity_import_directory: dir_paths.entity_import_directory,
      raw_files,
      processed_files,
      total_files: raw_files.length + processed_files.length
    }
  } catch (error) {
    log(`Error listing files for entity ${entity_id}: ${error.message}`)
    return null
  }
}

/**
 * List import files for all entities in an external system
 *
 * @param {Object} options - Function options
 * @param {string} options.external_system - External system name
 * @param {string} [options.import_history_base_directory] - Optional override for base directory
 * @returns {Promise<Array>} Array of entity import files info
 */
async function list_system_import_files({
  external_system,
  import_history_base_directory = null
}) {
  try {
    const results = []
    const dir_paths = get_system_import_directory_paths({
      external_system,
      import_history_base_directory
    })

    const system_directory = dir_paths.external_system_import_directory

    // Check if system directory exists
    if (!fs.existsSync(system_directory)) {
      return results
    }

    // List all entity directories
    const entity_dirs = fs.readdirSync(system_directory).filter((item) => {
      const full_path = path.join(system_directory, item)
      return fs.statSync(full_path).isDirectory()
    })

    // Process each entity directory
    for (const entity_id of entity_dirs) {
      const entity_files = await list_entity_import_files({
        external_system,
        entity_id,
        import_history_base_directory
      })

      if (entity_files && entity_files.total_files > 0) {
        results.push(entity_files)
      }
    }

    return results
  } catch (error) {
    log(`Error listing files for system ${external_system}: ${error.message}`)
    return []
  }
}

/**
 * Get list of available external systems
 *
 * @param {string} [import_history_base_directory] - Optional override for base directory
 * @returns {Promise<Array>} Array of external system names
 */
async function get_available_external_systems(
  import_history_base_directory = null
) {
  try {
    const base_directory = get_base_import_directory_path(
      import_history_base_directory
    )

    if (!fs.existsSync(base_directory)) {
      return []
    }

    return fs.readdirSync(base_directory).filter((item) => {
      const full_path = path.join(base_directory, item)
      return fs.statSync(full_path).isDirectory()
    })
  } catch (error) {
    log(`Error getting available external systems: ${error.message}`)
    return []
  }
}
