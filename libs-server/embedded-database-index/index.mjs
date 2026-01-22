/**
 * Embedded Database Index System
 *
 * Provides Kuzu (graph) and DuckDB (analytical) databases as index layers
 * for improved data view query performance. Files remain the source of truth;
 * databases serve as rebuildable indices.
 */

// Index manager - main entry point for initialization and sync
export { default as embedded_index_manager } from './embedded-index-manager.mjs'

// Kuzu graph database exports
export {
  kuzu_database_client,
  get_kuzu_connection,
  execute_kuzu_query,
  close_kuzu_connection
} from './kuzu/kuzu-database-client.mjs'

export {
  create_kuzu_schema,
  drop_kuzu_schema
} from './kuzu/kuzu-schema-definitions.mjs'

export {
  upsert_entity_to_kuzu,
  upsert_tag_to_kuzu,
  sync_entity_tags_to_kuzu,
  sync_entity_relations_to_kuzu,
  delete_entity_from_kuzu
} from './kuzu/kuzu-entity-sync.mjs'

export {
  find_entities_by_tag,
  find_entities_by_tags,
  find_related_entities,
  find_entities_relating_to,
  get_entity_graph
} from './kuzu/kuzu-graph-queries.mjs'

// DuckDB analytical database exports
export {
  duckdb_database_client,
  get_duckdb_connection,
  execute_duckdb_query,
  close_duckdb_connection
} from './duckdb/duckdb-database-client.mjs'

export {
  create_duckdb_schema,
  drop_duckdb_schema
} from './duckdb/duckdb-schema-definitions.mjs'

export {
  upsert_entity_to_duckdb,
  upsert_thread_to_duckdb,
  sync_entity_tags_to_duckdb,
  sync_entity_relations_to_duckdb,
  delete_entity_from_duckdb,
  delete_thread_from_duckdb
} from './duckdb/duckdb-entity-sync.mjs'

export {
  query_tasks_from_entities,
  count_tasks_from_entities,
  query_threads_from_duckdb,
  count_threads_in_duckdb,
  build_duckdb_where_clause,
  build_duckdb_order_clause
} from './duckdb/duckdb-table-queries.mjs'

export {
  query_git_activity_daily,
  upsert_git_activity_daily,
  query_thread_activity_aggregated
} from './duckdb/duckdb-activity-queries.mjs'

// Sync utilities
export {
  extract_entity_index_data,
  extract_tags_from_entity,
  extract_relations_from_entity
} from './sync/entity-data-extractor.mjs'

export {
  extract_thread_index_data,
  extract_edit_metrics_from_timeline
} from './sync/thread-data-extractor.mjs'

export {
  sync_git_activity_incremental,
  backfill_git_activity_from_scratch
} from './sync/sync-git-activity.mjs'

export {
  start_index_file_watcher,
  stop_index_file_watcher
} from './sync/index-file-watcher.mjs'

export { start_index_sync_watcher } from './sync/start-index-sync-watcher.mjs'
