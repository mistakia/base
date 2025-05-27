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
