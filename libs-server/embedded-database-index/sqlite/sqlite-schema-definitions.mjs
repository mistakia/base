/**
 * SQLite Schema Definitions
 *
 * Defines tables for entities, threads, tags, relations, activity, and embeddings.
 */

import debug from 'debug'

import { execute_sqlite_run } from './sqlite-database-client.mjs'

const log = debug('embedded-index:sqlite:schema')

const ENTITIES_TABLE_SCHEMA = `
CREATE TABLE IF NOT EXISTS entities (
  base_uri TEXT PRIMARY KEY,
  entity_id TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL,
  title TEXT,
  description TEXT,
  status TEXT,
  priority TEXT,
  archived INTEGER DEFAULT 0,
  public_read INTEGER,
  visibility_analyzed_at TEXT,
  user_public_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  frontmatter TEXT NOT NULL
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
  thread_id TEXT PRIMARY KEY,
  title TEXT,
  short_description TEXT,
  thread_state TEXT,
  created_at TEXT,
  updated_at TEXT,
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
  duration_minutes REAL,
  working_directory TEXT,
  working_directory_path TEXT,
  source_provider TEXT,
  inference_provider TEXT,
  primary_model TEXT,
  user_public_key TEXT,
  latest_event_timestamp TEXT,
  latest_event_type TEXT,
  latest_event_data TEXT,
  edit_count INTEGER DEFAULT 0,
  lines_changed INTEGER DEFAULT 0,
  file_references TEXT,
  directory_references TEXT,
  public_read INTEGER,
  visibility_analyzed_at TEXT,
  archived_at TEXT,
  archive_reason TEXT,
  external_session_id TEXT,
  has_continuation_prompt INTEGER,
  continuation_prompt_count INTEGER
)
`

const ACTIVITY_GIT_DAILY_TABLE_SCHEMA = `
CREATE TABLE IF NOT EXISTS activity_git_daily (
  date TEXT PRIMARY KEY,
  commits INTEGER DEFAULT 0,
  lines_changed INTEGER DEFAULT 0,
  files_changed INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL
)
`

const ACTIVITY_GIT_DAILY_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_activity_git_date ON activity_git_daily(date)'
]

const ACTIVITY_HEATMAP_DAILY_TABLE_SCHEMA = `
CREATE TABLE IF NOT EXISTS activity_heatmap_daily (
  date TEXT PRIMARY KEY,
  activity_git_commits INTEGER DEFAULT 0,
  activity_git_lines_changed INTEGER DEFAULT 0,
  activity_git_files_changed INTEGER DEFAULT 0,
  activity_token_usage INTEGER DEFAULT 0,
  activity_thread_edits INTEGER DEFAULT 0,
  activity_thread_lines_changed INTEGER DEFAULT 0,
  tasks_created INTEGER DEFAULT 0,
  tasks_completed INTEGER DEFAULT 0,
  score REAL DEFAULT 0,
  updated_at TEXT NOT NULL
)
`

const ENTITY_TAGS_TABLE_SCHEMA = `
CREATE TABLE IF NOT EXISTS entity_tags (
  entity_base_uri TEXT NOT NULL,
  tag_base_uri TEXT NOT NULL,
  PRIMARY KEY (entity_base_uri, tag_base_uri)
)
`

const THREAD_TAGS_TABLE_SCHEMA = `
CREATE TABLE IF NOT EXISTS thread_tags (
  thread_id TEXT NOT NULL,
  tag_base_uri TEXT NOT NULL,
  PRIMARY KEY (thread_id, tag_base_uri)
)
`

const ENTITY_RELATIONS_TABLE_SCHEMA = `
CREATE TABLE IF NOT EXISTS entity_relations (
  source_base_uri TEXT NOT NULL,
  target_base_uri TEXT NOT NULL,
  relation_type TEXT,
  context TEXT,
  PRIMARY KEY (source_base_uri, target_base_uri, relation_type)
)
`

const ENTITY_EMBEDDINGS_TABLE_SCHEMA = `
CREATE TABLE IF NOT EXISTS entity_embeddings (
  base_uri TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding BLOB NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (base_uri, chunk_index)
)
`

const ENTITY_EMBEDDINGS_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_entity_embeddings_base_uri ON entity_embeddings(base_uri)'
]

const INDEX_METADATA_TABLE_SCHEMA = `
CREATE TABLE IF NOT EXISTS index_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
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

// FTS5 virtual tables for full-text search
const ENTITIES_FTS_TABLE = `
CREATE VIRTUAL TABLE IF NOT EXISTS entities_fts USING fts5(
  base_uri UNINDEXED,
  title,
  description,
  content=entities,
  content_rowid=rowid
)
`

const THREADS_FTS_TABLE = `
CREATE VIRTUAL TABLE IF NOT EXISTS threads_fts USING fts5(
  thread_id UNINDEXED,
  title,
  short_description,
  content=threads,
  content_rowid=rowid
)
`

// Triggers to keep FTS tables in sync with content tables
const ENTITIES_FTS_TRIGGERS = [
  `CREATE TRIGGER IF NOT EXISTS entities_ai AFTER INSERT ON entities BEGIN
    INSERT INTO entities_fts(rowid, base_uri, title, description)
    VALUES (new.rowid, new.base_uri, new.title, new.description);
  END`,
  `CREATE TRIGGER IF NOT EXISTS entities_ad AFTER DELETE ON entities BEGIN
    INSERT INTO entities_fts(entities_fts, rowid, base_uri, title, description)
    VALUES ('delete', old.rowid, old.base_uri, old.title, old.description);
  END`,
  `CREATE TRIGGER IF NOT EXISTS entities_au AFTER UPDATE ON entities BEGIN
    INSERT INTO entities_fts(entities_fts, rowid, base_uri, title, description)
    VALUES ('delete', old.rowid, old.base_uri, old.title, old.description);
    INSERT INTO entities_fts(rowid, base_uri, title, description)
    VALUES (new.rowid, new.base_uri, new.title, new.description);
  END`
]

const THREADS_FTS_TRIGGERS = [
  `CREATE TRIGGER IF NOT EXISTS threads_ai AFTER INSERT ON threads BEGIN
    INSERT INTO threads_fts(rowid, thread_id, title, short_description)
    VALUES (new.rowid, new.thread_id, new.title, new.short_description);
  END`,
  `CREATE TRIGGER IF NOT EXISTS threads_ad AFTER DELETE ON threads BEGIN
    INSERT INTO threads_fts(threads_fts, rowid, thread_id, title, short_description)
    VALUES ('delete', old.rowid, old.thread_id, old.title, old.short_description);
  END`,
  `CREATE TRIGGER IF NOT EXISTS threads_au AFTER UPDATE ON threads BEGIN
    INSERT INTO threads_fts(threads_fts, rowid, thread_id, title, short_description)
    VALUES ('delete', old.rowid, old.thread_id, old.title, old.short_description);
    INSERT INTO threads_fts(rowid, thread_id, title, short_description)
    VALUES (new.rowid, new.thread_id, new.title, new.short_description);
  END`
]

export async function create_sqlite_schema() {
  log('Creating SQLite schema')

  try {
    await execute_sqlite_run({ query: ENTITIES_TABLE_SCHEMA })
    log('Entities table created')

    for (const index_sql of ENTITIES_INDEXES) {
      await execute_sqlite_run({ query: index_sql })
    }
    log('Entities indexes created')

    await execute_sqlite_run({ query: THREADS_TABLE_SCHEMA })
    log('Threads table created')

    await execute_sqlite_run({ query: ENTITY_TAGS_TABLE_SCHEMA })
    log('Entity tags table created')

    await execute_sqlite_run({ query: ENTITY_RELATIONS_TABLE_SCHEMA })
    log('Entity relations table created')

    for (const index_sql of THREADS_INDEXES) {
      await execute_sqlite_run({ query: index_sql })
    }
    log('Threads indexes created')

    for (const index_sql of ENTITY_TAGS_INDEXES) {
      await execute_sqlite_run({ query: index_sql })
    }
    log('Entity tags indexes created')

    await execute_sqlite_run({ query: THREAD_TAGS_TABLE_SCHEMA })
    log('Thread tags table created')

    for (const index_sql of THREAD_TAGS_INDEXES) {
      await execute_sqlite_run({ query: index_sql })
    }
    log('Thread tags indexes created')

    for (const index_sql of ENTITY_RELATIONS_INDEXES) {
      await execute_sqlite_run({ query: index_sql })
    }
    log('Entity relations indexes created')

    await execute_sqlite_run({ query: INDEX_METADATA_TABLE_SCHEMA })
    log('Index metadata table created')

    await execute_sqlite_run({ query: ACTIVITY_GIT_DAILY_TABLE_SCHEMA })
    log('Activity git daily table created')

    for (const index_sql of ACTIVITY_GIT_DAILY_INDEXES) {
      await execute_sqlite_run({ query: index_sql })
    }
    log('Activity git daily indexes created')

    await execute_sqlite_run({ query: ACTIVITY_HEATMAP_DAILY_TABLE_SCHEMA })
    log('Activity heatmap daily table created')

    await execute_sqlite_run({ query: ENTITY_EMBEDDINGS_TABLE_SCHEMA })
    log('Entity embeddings table created')

    for (const index_sql of ENTITY_EMBEDDINGS_INDEXES) {
      await execute_sqlite_run({ query: index_sql })
    }
    log('Entity embeddings indexes created')

    // FTS5 virtual tables
    await execute_sqlite_run({ query: ENTITIES_FTS_TABLE })
    log('Entities FTS5 table created')

    await execute_sqlite_run({ query: THREADS_FTS_TABLE })
    log('Threads FTS5 table created')

    // FTS sync triggers
    for (const trigger_sql of ENTITIES_FTS_TRIGGERS) {
      await execute_sqlite_run({ query: trigger_sql })
    }
    log('Entities FTS triggers created')

    for (const trigger_sql of THREADS_FTS_TRIGGERS) {
      await execute_sqlite_run({ query: trigger_sql })
    }
    log('Threads FTS triggers created')

    log('SQLite schema creation complete')
  } catch (error) {
    log('Error creating SQLite schema: %s', error.message)
    throw error
  }
}

export async function drop_sqlite_schema() {
  log('Dropping SQLite schema')

  try {
    // Drop FTS triggers first
    await execute_sqlite_run({ query: 'DROP TRIGGER IF EXISTS entities_ai' })
    await execute_sqlite_run({ query: 'DROP TRIGGER IF EXISTS entities_ad' })
    await execute_sqlite_run({ query: 'DROP TRIGGER IF EXISTS entities_au' })
    await execute_sqlite_run({ query: 'DROP TRIGGER IF EXISTS threads_ai' })
    await execute_sqlite_run({ query: 'DROP TRIGGER IF EXISTS threads_ad' })
    await execute_sqlite_run({ query: 'DROP TRIGGER IF EXISTS threads_au' })

    // Drop FTS tables
    await execute_sqlite_run({ query: 'DROP TABLE IF EXISTS entities_fts' })
    await execute_sqlite_run({ query: 'DROP TABLE IF EXISTS threads_fts' })

    // Drop data tables
    await execute_sqlite_run({ query: 'DROP TABLE IF EXISTS entity_relations' })
    await execute_sqlite_run({ query: 'DROP TABLE IF EXISTS entity_tags' })
    await execute_sqlite_run({ query: 'DROP TABLE IF EXISTS thread_tags' })
    await execute_sqlite_run({ query: 'DROP TABLE IF EXISTS threads' })
    await execute_sqlite_run({ query: 'DROP TABLE IF EXISTS entities' })
    await execute_sqlite_run({ query: 'DROP TABLE IF EXISTS index_metadata' })
    await execute_sqlite_run({
      query: 'DROP TABLE IF EXISTS activity_git_daily'
    })
    await execute_sqlite_run({
      query: 'DROP TABLE IF EXISTS activity_heatmap_daily'
    })
    await execute_sqlite_run({
      query: 'DROP TABLE IF EXISTS entity_embeddings'
    })
    log('SQLite schema dropped')
  } catch (error) {
    log('Error dropping SQLite schema: %s', error.message)
    throw error
  }
}
