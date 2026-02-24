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
 * @param {string} [options.external_system] - Filter by external system (e.g., github)
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
      // First check without import_source (for systems that use flat structure)
      const entity_files_no_source = await list_entity_import_files({
        external_system,
        entity_id,
        import_history_base_directory,
        import_source: null
      })

      if (entity_files_no_source && entity_files_no_source.total_files > 0) {
        results.push(entity_files_no_source)
      }

      // Then check all discovered import sources for this system
      const import_sources = await discover_import_sources_for_system({
        external_system,
        import_history_base_directory
      })

      for (const import_source of import_sources) {
        const entity_files = await list_entity_import_files({
          external_system,
          entity_id,
          import_history_base_directory,
          import_source
        })

        if (entity_files && entity_files.total_files > 0) {
          results.push(entity_files)
        }
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
 * @param {string} [options.import_source] - Optional import source identifier
 * @returns {Promise<Object|null>} Entity import files info or null if not found
 */
async function list_entity_import_files({
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
      import_source,
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
 * Automatically discovers structure: flat (entity_id directly) or nested (import_source/entity_id)
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

    // Discover import sources by scanning directory structure
    const import_sources = await discover_import_sources_for_system({
      external_system,
      import_history_base_directory
    })

    // UUID pattern: 8-4-4-4-12 hex characters
    const uuid_pattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

    // Process each import source directory (nested structure)
    for (const import_source of import_sources) {
      const import_source_path = path.join(system_directory, import_source)

      if (!fs.existsSync(import_source_path)) {
        continue
      }

      // List all entity_id subdirectories within this import_source
      const entity_dirs = fs.readdirSync(import_source_path).filter((item) => {
        const full_path = path.join(import_source_path, item)
        return fs.statSync(full_path).isDirectory()
      })

      for (const entity_id of entity_dirs) {
        if (uuid_pattern.test(entity_id)) {
          const entity_files = await list_entity_import_files({
            external_system,
            entity_id,
            import_history_base_directory,
            import_source
          })

          if (entity_files && entity_files.total_files > 0) {
            results.push(entity_files)
          }
        }
      }
    }

    // Also check for entities directly in system directory (flat structure)
    // Skip directories that are import sources
    const direct_entity_dirs = fs
      .readdirSync(system_directory)
      .filter((item) => {
        const full_path = path.join(system_directory, item)
        if (!fs.statSync(full_path).isDirectory()) {
          return false
        }
        // Skip import_source directories we already processed
        return !import_sources.includes(item)
      })

    for (const entity_id of direct_entity_dirs) {
      if (uuid_pattern.test(entity_id)) {
        const entity_files = await list_entity_import_files({
          external_system,
          entity_id,
          import_history_base_directory,
          import_source: null
        })

        if (entity_files && entity_files.total_files > 0) {
          results.push(entity_files)
        }
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

/**
 * Discover import sources for an external system by scanning directory structure
 * This automatically detects whether a system uses flat structure
 * or nested structure with import sources (e.g., github with issues/project)
 *
 * @param {Object} options - Function options
 * @param {string} options.external_system - External system name
 * @param {string} [options.import_history_base_directory] - Optional override for base directory
 * @returns {Promise<Array<string>>} Array of discovered import source identifiers
 */
async function discover_import_sources_for_system({
  external_system,
  import_history_base_directory = null
}) {
  try {
    const dir_paths = get_system_import_directory_paths({
      external_system,
      import_history_base_directory
    })

    const system_directory = dir_paths.external_system_import_directory

    if (!fs.existsSync(system_directory)) {
      return []
    }

    const import_sources = []
    const uuid_pattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

    // Scan system directory for subdirectories
    const subdirs = fs.readdirSync(system_directory).filter((item) => {
      const full_path = path.join(system_directory, item)
      return fs.statSync(full_path).isDirectory()
    })

    for (const subdir of subdirs) {
      const subdir_path = path.join(system_directory, subdir)

      // Check if this subdirectory contains entity_id subdirectories
      // If it does, it's an import_source directory (nested structure)
      const subdir_contents = fs.readdirSync(subdir_path).filter((item) => {
        const full_path = path.join(subdir_path, item)
        return fs.statSync(full_path).isDirectory()
      })

      // If subdirectory contains UUID-like directories, it's an import_source
      const contains_entity_ids = subdir_contents.some((item) =>
        uuid_pattern.test(item)
      )

      // Also check if it doesn't directly contain 'raw' or 'processed' directories
      // (which would indicate it's an entity_id directory, not an import_source)
      const has_raw_or_processed =
        fs.existsSync(path.join(subdir_path, 'raw')) ||
        fs.existsSync(path.join(subdir_path, 'processed'))

      if (contains_entity_ids && !has_raw_or_processed) {
        import_sources.push(subdir)
      }
    }

    return import_sources
  } catch (error) {
    log(
      `Error discovering import sources for ${external_system}: ${error.message}`
    )
    return []
  }
}
