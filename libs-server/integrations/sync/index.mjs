import * as sync_core from './sync-core.mjs'
import * as conflict_resolver from './conflict-resolver.mjs'
import * as import_manager from './import-manager.mjs'

// Re-export all functions from the individual modules
export const {
  create_content_identifier,
  detect_field_changes,
  format_value_for_comparison,
  get_entity_sync_config,
  update_field_last_updated_timestamps,
  get_entity_data_with_extensions
} = sync_core

export const {
  resolution_strategies,
  resolve_internal_wins,
  resolve_external_wins,
  resolve_newest_wins,
  queue_for_manual_resolution,
  detect_conflicts,
  resolve_entity_conflicts,
  apply_resolutions,
  manual_resolve_conflicts
} = conflict_resolver

export const {
  record_import_history,
  get_sync_history,
  find_recent_conflicts
} = import_manager
