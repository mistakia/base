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
 * @returns {Object} Object with import directory paths
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
    import_history_directory: base_dir,
    external_system_import_directory: system_dir,
    entity_import_directory: entity_dir,
    raw_data_directory: path.join(entity_dir, 'raw'),
    processed_data_directory: path.join(entity_dir, 'processed')
  }
}
