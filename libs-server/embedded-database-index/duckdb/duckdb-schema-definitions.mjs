/**
 * DuckDB Schema Definitions
 *
 * Defines tables for tasks, threads, tags, and relations.
 */

import debug from 'debug'

import { execute_duckdb_run } from './duckdb-database-client.mjs'

const log = debug('embedded-index:duckdb:schema')

const ENTITIES_TABLE_SCHEMA = `
CREATE TABLE IF NOT EXISTS entities (
  base_uri VARCHAR PRIMARY KEY,
  entity_id VARCHAR UNIQUE NOT NULL,
  type VARCHAR NOT NULL,
  title VARCHAR,
  description VARCHAR,
  status VARCHAR,
  priority VARCHAR,
  archived BOOLEAN DEFAULT FALSE,
  public_read BOOLEAN,
  visibility_analyzed_at TIMESTAMP,
  user_public_key VARCHAR NOT NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  archived_at TIMESTAMP,
  frontmatter JSON NOT NULL
)
`

const ENTITIES_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type)',
  'CREATE INDEX IF NOT EXISTS idx_entities_status ON entities(status)',
  'CREATE INDEX IF NOT EXISTS idx_entities_priority ON entities(priority)',
  'CREATE INDEX IF NOT EXISTS idx_entities_user ON entities(user_public_key)',
  'CREATE INDEX IF NOT EXISTS idx_entities_updated ON entities(updated_at)',
  'CREATE INDEX IF NOT EXISTS idx_entities_archived ON entities(archived)',
  'CREATE INDEX IF NOT EXISTS idx_entities_entity_id ON entities(entity_id)'
]

const THREADS_TABLE_SCHEMA = `
CREATE TABLE IF NOT EXISTS threads (
  thread_id VARCHAR PRIMARY KEY,
  title VARCHAR,
  short_description VARCHAR,
  thread_state VARCHAR,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  message_count INTEGER,
  user_message_count INTEGER,
  assistant_message_count INTEGER,
  tool_call_count INTEGER,
  total_input_tokens BIGINT,
  total_output_tokens BIGINT,
  cache_creation_input_tokens BIGINT,
  cache_read_input_tokens BIGINT,
  total_tokens BIGINT,
  duration_ms BIGINT,
  duration_minutes DOUBLE,
  working_directory VARCHAR,
  working_directory_path VARCHAR,
  source_provider VARCHAR,
  inference_provider VARCHAR,
  primary_model VARCHAR,
  user_public_key VARCHAR,
  latest_event_timestamp TIMESTAMP,
  latest_event_type VARCHAR,
  latest_event_data TEXT,
  edit_count INTEGER DEFAULT 0,
  lines_changed INTEGER DEFAULT 0,
  file_references TEXT,
  directory_references TEXT,
  public_read BOOLEAN,
  visibility_analyzed_at TIMESTAMP
)
`

const ACTIVITY_GIT_DAILY_TABLE_SCHEMA = `
CREATE TABLE IF NOT EXISTS activity_git_daily (
  date DATE PRIMARY KEY,
  commits INTEGER DEFAULT 0,
  lines_changed INTEGER DEFAULT 0,
  files_changed INTEGER DEFAULT 0,
  updated_at TIMESTAMP NOT NULL
)
`

const ACTIVITY_GIT_DAILY_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_activity_git_date ON activity_git_daily(date)'
]

const ACTIVITY_HEATMAP_DAILY_TABLE_SCHEMA = `
CREATE TABLE IF NOT EXISTS activity_heatmap_daily (
  date DATE PRIMARY KEY,
  activity_git_commits INTEGER DEFAULT 0,
  activity_git_lines_changed INTEGER DEFAULT 0,
  activity_git_files_changed INTEGER DEFAULT 0,
  activity_token_usage INTEGER DEFAULT 0,
  activity_thread_edits INTEGER DEFAULT 0,
  activity_thread_lines_changed INTEGER DEFAULT 0,
  score DOUBLE DEFAULT 0,
  updated_at TIMESTAMP NOT NULL
)
`

const ENTITY_TAGS_TABLE_SCHEMA = `
CREATE TABLE IF NOT EXISTS entity_tags (
  entity_base_uri VARCHAR NOT NULL,
  tag_base_uri VARCHAR NOT NULL,
  PRIMARY KEY (entity_base_uri, tag_base_uri)
)
`

const THREAD_TAGS_TABLE_SCHEMA = `
CREATE TABLE IF NOT EXISTS thread_tags (
  thread_id VARCHAR NOT NULL,
  tag_base_uri VARCHAR NOT NULL,
  PRIMARY KEY (thread_id, tag_base_uri)
)
`

const ENTITY_RELATIONS_TABLE_SCHEMA = `
CREATE TABLE IF NOT EXISTS entity_relations (
  source_base_uri VARCHAR NOT NULL,
  target_base_uri VARCHAR NOT NULL,
  relation_type VARCHAR,
  context VARCHAR,
  PRIMARY KEY (source_base_uri, target_base_uri, relation_type)
)
`

const INDEX_METADATA_TABLE_SCHEMA = `
CREATE TABLE IF NOT EXISTS index_metadata (
  key VARCHAR PRIMARY KEY,
  value VARCHAR NOT NULL,
  updated_at TIMESTAMP NOT NULL
)
`

const THREADS_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_threads_state ON threads(thread_state)',
  'CREATE INDEX IF NOT EXISTS idx_threads_created ON threads(created_at)',
  'CREATE INDEX IF NOT EXISTS idx_threads_updated ON threads(updated_at)',
  'CREATE INDEX IF NOT EXISTS idx_threads_user ON threads(user_public_key)',
  'CREATE INDEX IF NOT EXISTS idx_threads_latest_event ON threads(latest_event_timestamp)'
]

const ENTITY_TAGS_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_entity_tags_entity ON entity_tags(entity_base_uri)',
  'CREATE INDEX IF NOT EXISTS idx_entity_tags_tag ON entity_tags(tag_base_uri)'
]

const THREAD_TAGS_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_thread_tags_thread ON thread_tags(thread_id)',
  'CREATE INDEX IF NOT EXISTS idx_thread_tags_tag ON thread_tags(tag_base_uri)'
]

const ENTITY_RELATIONS_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_relations_source ON entity_relations(source_base_uri)',
  'CREATE INDEX IF NOT EXISTS idx_relations_target ON entity_relations(target_base_uri)',
  'CREATE INDEX IF NOT EXISTS idx_relations_type ON entity_relations(relation_type)'
]

export async function create_duckdb_schema() {
  log('Creating DuckDB schema')

  try {
    // Create unified entities table
    await execute_duckdb_run({ query: ENTITIES_TABLE_SCHEMA })
    log('Entities table created')

    // Create entities indexes
    for (const index_sql of ENTITIES_INDEXES) {
      await execute_duckdb_run({ query: index_sql })
    }
    log('Entities indexes created')

    await execute_duckdb_run({ query: THREADS_TABLE_SCHEMA })
    log('Threads table created')

    await execute_duckdb_run({ query: ENTITY_TAGS_TABLE_SCHEMA })
    log('Entity tags table created')

    await execute_duckdb_run({ query: ENTITY_RELATIONS_TABLE_SCHEMA })
    log('Entity relations table created')

    for (const index_sql of THREADS_INDEXES) {
      await execute_duckdb_run({ query: index_sql })
    }
    log('Threads indexes created')

    for (const index_sql of ENTITY_TAGS_INDEXES) {
      await execute_duckdb_run({ query: index_sql })
    }
    log('Entity tags indexes created')

    await execute_duckdb_run({ query: THREAD_TAGS_TABLE_SCHEMA })
    log('Thread tags table created')

    for (const index_sql of THREAD_TAGS_INDEXES) {
      await execute_duckdb_run({ query: index_sql })
    }
    log('Thread tags indexes created')

    for (const index_sql of ENTITY_RELATIONS_INDEXES) {
      await execute_duckdb_run({ query: index_sql })
    }
    log('Entity relations indexes created')

    await execute_duckdb_run({ query: INDEX_METADATA_TABLE_SCHEMA })
    log('Index metadata table created')

    await execute_duckdb_run({ query: ACTIVITY_GIT_DAILY_TABLE_SCHEMA })
    log('Activity git daily table created')

    for (const index_sql of ACTIVITY_GIT_DAILY_INDEXES) {
      await execute_duckdb_run({ query: index_sql })
    }
    log('Activity git daily indexes created')

    await execute_duckdb_run({ query: ACTIVITY_HEATMAP_DAILY_TABLE_SCHEMA })
    log('Activity heatmap daily table created')

    log('DuckDB schema creation complete')
  } catch (error) {
    log('Error creating DuckDB schema: %s', error.message)
    throw error
  }
}

export async function drop_duckdb_schema() {
  log('Dropping DuckDB schema')

  try {
    await execute_duckdb_run({ query: 'DROP TABLE IF EXISTS entity_relations' })
    await execute_duckdb_run({ query: 'DROP TABLE IF EXISTS entity_tags' })
    await execute_duckdb_run({ query: 'DROP TABLE IF EXISTS thread_tags' })
    await execute_duckdb_run({ query: 'DROP TABLE IF EXISTS threads' })
    await execute_duckdb_run({ query: 'DROP TABLE IF EXISTS entities' })
    await execute_duckdb_run({ query: 'DROP TABLE IF EXISTS index_metadata' })
    await execute_duckdb_run({
      query: 'DROP TABLE IF EXISTS activity_git_daily'
    })
    await execute_duckdb_run({
      query: 'DROP TABLE IF EXISTS activity_heatmap_daily'
    })
    log('DuckDB schema dropped')
  } catch (error) {
    log('Error dropping DuckDB schema: %s', error.message)
    throw error
  }
}
