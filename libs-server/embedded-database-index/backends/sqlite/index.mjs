/**
 * SQLite Backend Mapping
 *
 * Maps generic method names to existing SQLite query functions.
 * This is a thin delegation layer -- the SQLite modules are not modified.
 */

import {
  query_threads_from_sqlite,
  count_threads_in_sqlite,
  query_entities_from_sqlite,
  count_entities_in_sqlite,
  get_entity_by_base_uri,
  get_entity_by_id,
  query_tasks_from_entities,
  count_tasks_from_entities,
  query_tags_used_by,
  query_tag_statistics_from_sqlite,
  query_physical_items_from_entities,
  count_physical_items_from_entities
} from '../../sqlite/sqlite-table-queries.mjs'

import {
  find_related_entities,
  find_entities_relating_to,
  find_threads_relating_to
} from '../../sqlite/sqlite-relation-queries.mjs'

import {
  query_git_activity_daily,
  upsert_git_activity_daily_batch,
  query_thread_activity_aggregated,
  query_heatmap_daily_all,
  upsert_heatmap_daily_batch,
  truncate_heatmap_daily,
  get_heatmap_daily_count,
  query_entities_by_thread_activity,
  query_tasks_from_entities as query_tasks_for_activity
} from '../../sqlite/sqlite-activity-queries.mjs'

import {
  upsert_embeddings,
  search_similar,
  delete_entity_embeddings,
  get_embedding_hashes
} from '../../sqlite/sqlite-embedding-queries.mjs'

const sqlite_backend = {
  // Table queries
  query_threads: query_threads_from_sqlite,
  count_threads: count_threads_in_sqlite,
  query_entities: query_entities_from_sqlite,
  count_entities: count_entities_in_sqlite,
  get_entity_by_uri: get_entity_by_base_uri,
  get_entity_by_id,
  query_tasks: query_tasks_from_entities,
  count_tasks: count_tasks_from_entities,
  query_tags: query_tags_used_by,
  query_tag_statistics: query_tag_statistics_from_sqlite,
  query_physical_items: query_physical_items_from_entities,
  count_physical_items: count_physical_items_from_entities,

  // Relation queries
  find_related_entities,
  find_entities_relating_to,
  find_threads_relating_to,

  // Activity queries
  query_git_activity_daily,
  upsert_git_activity_daily_batch,
  query_thread_activity_aggregated,
  query_heatmap_daily: query_heatmap_daily_all,
  upsert_heatmap_daily_batch,
  truncate_heatmap_daily,
  get_heatmap_count: get_heatmap_daily_count,
  query_entities_by_thread_activity,
  query_tasks_for_activity,

  // Embedding queries
  upsert_embeddings,
  search_similar,
  delete_entity_embeddings,
  get_embedding_hashes
}

export default sqlite_backend
