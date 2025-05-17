// Conflict detection
export { detect_conflicts, determine_update_strategy } from './detection.mjs'

// Conflict resolution
export {
  resolution_strategies,
  resolve_internal_wins,
  resolve_external_wins,
  resolve_newest_wins,
  queue_for_manual_resolution,
  resolve_entity_conflicts,
  apply_resolutions,
  manual_resolve_conflicts
} from './resolution.mjs'
