/**
 * DuckDB Schema Definitions
 *
 * Defines tables for tasks, threads, tags, and relations.
 */

import debug from 'debug'
import { execute_duckdb_run } from './duckdb-database-client.mjs'

const log = debug('embedded-index:duckdb:schema')

const TASKS_TABLE_SCHEMA = `
CREATE TABLE IF NOT EXISTS tasks (
  entity_id VARCHAR PRIMARY KEY,
  base_uri VARCHAR UNIQUE NOT NULL,
  title VARCHAR,
  status VARCHAR,
  priority VARCHAR,
  description VARCHAR,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  start_by TIMESTAMP,
  finish_by TIMESTAMP,
  planned_start TIMESTAMP,
  planned_finish TIMESTAMP,
  started_at TIMESTAMP,
  finished_at TIMESTAMP,
  snooze_until TIMESTAMP,
  estimated_total_duration DOUBLE,
  archived BOOLEAN DEFAULT FALSE,
  user_public_key VARCHAR
)
`

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
  total_input_tokens INTEGER,
  total_output_tokens INTEGER,
  cache_creation_input_tokens INTEGER,
  cache_read_input_tokens INTEGER,
  total_tokens INTEGER,
  duration_ms INTEGER,
  duration_minutes DOUBLE,
  working_directory VARCHAR,
  working_directory_path VARCHAR,
  session_provider VARCHAR,
  inference_provider VARCHAR,
  primary_model VARCHAR,
  user_public_key VARCHAR
)
`

const ENTITY_TAGS_TABLE_SCHEMA = `
CREATE TABLE IF NOT EXISTS entity_tags (
  entity_base_uri VARCHAR NOT NULL,
  tag_base_uri VARCHAR NOT NULL,
  PRIMARY KEY (entity_base_uri, tag_base_uri)
)
`

const ENTITY_RELATIONS_TABLE_SCHEMA = `
CREATE TABLE IF NOT EXISTS entity_relations (
  id INTEGER PRIMARY KEY,
  source_base_uri VARCHAR NOT NULL,
  target_base_uri VARCHAR NOT NULL,
  relation_type VARCHAR,
  context VARCHAR
)
`

const TASKS_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)',
  'CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority)',
  'CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at)',
  'CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_public_key)',
  'CREATE INDEX IF NOT EXISTS idx_tasks_archived ON tasks(archived)'
]

const THREADS_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_threads_state ON threads(thread_state)',
  'CREATE INDEX IF NOT EXISTS idx_threads_created ON threads(created_at)',
  'CREATE INDEX IF NOT EXISTS idx_threads_user ON threads(user_public_key)'
]

const ENTITY_TAGS_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_entity_tags_entity ON entity_tags(entity_base_uri)',
  'CREATE INDEX IF NOT EXISTS idx_entity_tags_tag ON entity_tags(tag_base_uri)'
]

const ENTITY_RELATIONS_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_relations_source ON entity_relations(source_base_uri)',
  'CREATE INDEX IF NOT EXISTS idx_relations_target ON entity_relations(target_base_uri)',
  'CREATE INDEX IF NOT EXISTS idx_relations_type ON entity_relations(relation_type)'
]

export async function create_duckdb_schema({ connection }) {
  log('Creating DuckDB schema')

  try {
    // Create tables
    await execute_duckdb_run({ query: TASKS_TABLE_SCHEMA })
    log('Tasks table created')

    await execute_duckdb_run({ query: THREADS_TABLE_SCHEMA })
    log('Threads table created')

    await execute_duckdb_run({ query: ENTITY_TAGS_TABLE_SCHEMA })
    log('Entity tags table created')

    await execute_duckdb_run({ query: ENTITY_RELATIONS_TABLE_SCHEMA })
    log('Entity relations table created')

    // Create indexes
    for (const index_sql of TASKS_INDEXES) {
      await execute_duckdb_run({ query: index_sql })
    }
    log('Tasks indexes created')

    for (const index_sql of THREADS_INDEXES) {
      await execute_duckdb_run({ query: index_sql })
    }
    log('Threads indexes created')

    for (const index_sql of ENTITY_TAGS_INDEXES) {
      await execute_duckdb_run({ query: index_sql })
    }
    log('Entity tags indexes created')

    for (const index_sql of ENTITY_RELATIONS_INDEXES) {
      await execute_duckdb_run({ query: index_sql })
    }
    log('Entity relations indexes created')

    log('DuckDB schema creation complete')
  } catch (error) {
    log('Error creating DuckDB schema: %s', error.message)
    throw error
  }
}

export async function drop_duckdb_schema({ connection }) {
  log('Dropping DuckDB schema')

  try {
    await execute_duckdb_run({ query: 'DROP TABLE IF EXISTS entity_relations' })
    await execute_duckdb_run({ query: 'DROP TABLE IF EXISTS entity_tags' })
    await execute_duckdb_run({ query: 'DROP TABLE IF EXISTS threads' })
    await execute_duckdb_run({ query: 'DROP TABLE IF EXISTS tasks' })
    log('DuckDB schema dropped')
  } catch (error) {
    log('Error dropping DuckDB schema: %s', error.message)
    throw error
  }
}

export const DUCKDB_SCHEMA = {
  TASKS_TABLE_SCHEMA,
  THREADS_TABLE_SCHEMA,
  ENTITY_TAGS_TABLE_SCHEMA,
  ENTITY_RELATIONS_TABLE_SCHEMA
}
