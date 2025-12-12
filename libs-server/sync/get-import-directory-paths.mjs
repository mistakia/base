import path from 'path'

import config from '#config'

const default_import_history_base_directory = path.join(
  config.user_base_directory || process.cwd(),
  'import-history'
)

/**
 * Get the directory path for storing import data
 *
 * @param {Object} options - Function options
 * @param {string} options.external_system - Name of external system
 * @param {string} options.entity_id - Entity UUID
 * @param {string} [options.import_history_base_directory] - Optional override for base directory
 * @param {string} [options.import_source] - Optional import source identifier (e.g., 'issues', 'project') to separate import histories
 * @returns {Object} Object with import directory paths
 */
export function get_import_directory_paths({
  external_system,
  entity_id,
  import_history_base_directory,
  import_source = null
}) {
  const base_dir =
    import_history_base_directory || default_import_history_base_directory
  const system_dir = path.join(base_dir, external_system)

  // Include import_source in path if provided to keep separate import histories
  const entity_dir = import_source
    ? path.join(system_dir, import_source, entity_id)
    : path.join(system_dir, entity_id)

  return {
    import_history_directory: base_dir,
    external_system_import_directory: system_dir,
    entity_import_directory: entity_dir,
    raw_data_directory: path.join(entity_dir, 'raw'),
    processed_data_directory: path.join(entity_dir, 'processed')
  }
}

/**
 * Get system-level import directory paths (without entity-specific paths)
 *
 * @param {Object} options - Function options
 * @param {string} options.external_system - Name of external system
 * @param {string} [options.import_history_base_directory] - Optional override for base directory
 * @returns {Object} Object with system-level import directory paths
 */
export function get_system_import_directory_paths({
  external_system,
  import_history_base_directory
}) {
  const base_dir =
    import_history_base_directory || default_import_history_base_directory
  const system_dir = path.join(base_dir, external_system)

  return {
    import_history_directory: base_dir,
    external_system_import_directory: system_dir
  }
}

/**
 * Get base import history directory path
 *
 * @param {string} [import_history_base_directory] - Optional override for base directory
 * @returns {string} Base import history directory path
 */
export function get_base_import_directory_path(
  import_history_base_directory = null
) {
  return import_history_base_directory || default_import_history_base_directory
}
