/**
 * @fileoverview Unit tests for the v8 embedded-index schema migration.
 */

import { expect } from 'chai'
import { promises as fs } from 'fs'
import path from 'path'

import config from '#config'
import {
  initialize_sqlite_client,
  execute_sqlite_query,
  execute_sqlite_run,
  close_sqlite_connection
} from '#libs-server/embedded-database-index/sqlite/sqlite-database-client.mjs'
import {
  get_index_metadata,
  set_index_metadata,
  INDEX_METADATA_KEYS
} from '#libs-server/embedded-database-index/sqlite/sqlite-metadata-operations.mjs'
import {
  migrate_to_v8,
  TARGET_SCHEMA_VERSION
} from '#libs-server/embedded-database-index/sqlite/migrations/migrate-to-v8.mjs'

const V7_ENTITIES_FTS = `
  CREATE VIRTUAL TABLE entities_fts USING fts5(
    base_uri UNINDEXED,
    title,
    description,
    content=entities,
    content_rowid=rowid
  )
`

const V7_ENTITIES_FTS_TRIGGER_AI = `
  CREATE TRIGGER entities_ai AFTER INSERT ON entities BEGIN
    INSERT INTO entities_fts(rowid, base_uri, title, description)
    VALUES (new.rowid, new.base_uri, new.title, new.description);
  END
`

const V7_THREADS_FTS = `
  CREATE VIRTUAL TABLE threads_fts USING fts5(
    thread_id UNINDEXED,
    title,
    short_description,
    content=threads,
    content_rowid=rowid
  )
`

async function seed_v7_schema() {
  await execute_sqlite_run({
    query: `CREATE TABLE entities (
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
    )`
  })
  await execute_sqlite_run({
    query: `CREATE TABLE threads (
      thread_id TEXT PRIMARY KEY,
      title TEXT,
      short_description TEXT
    )`
  })
  await execute_sqlite_run({
    query: `CREATE TABLE entity_embeddings (
      base_uri TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      chunk_text TEXT NOT NULL,
      embedding BLOB NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (base_uri, chunk_index)
    )`
  })
  await execute_sqlite_run({
    query: `CREATE TABLE index_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`
  })
  await execute_sqlite_run({ query: V7_ENTITIES_FTS })
  await execute_sqlite_run({ query: V7_ENTITIES_FTS_TRIGGER_AI })
  await execute_sqlite_run({ query: V7_THREADS_FTS })
}

describe('migrate_to_v8', function () {
  this.timeout(15000)

  let original_user_base_directory

  before(async () => {
    await close_sqlite_connection()
    await initialize_sqlite_client({ in_memory: true })
    await seed_v7_schema()

    await set_index_metadata({
      key: INDEX_METADATA_KEYS.SCHEMA_VERSION,
      value: '7'
    })

    original_user_base_directory = config.user_base_directory
    const test_dir = config.user_base_directory
    await fs.mkdir(path.join(test_dir, 'task'), { recursive: true })
    await fs.mkdir(path.join(test_dir, 'thread', 't-empty'), {
      recursive: true
    })

    const entity_path = path.join(test_dir, 'task', 'example.md')
    await fs.writeFile(
      entity_path,
      `---
title: Example Task
type: task
entity_id: 11111111-2222-3333-4444-555555555555
user_public_key: 0000000000000000000000000000000000000000000000000000000000000000
created_at: '2026-04-01T00:00:00.000Z'
updated_at: '2026-04-01T00:00:00.000Z'
---

# Example

Body text referencing nano-community.
`
    )

    await execute_sqlite_run({
      query: `INSERT INTO entities (
        base_uri, entity_id, type, title, description,
        status, priority, archived, public_read, visibility_analyzed_at,
        user_public_key, created_at, updated_at, archived_at, frontmatter
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      parameters: [
        'user:task/example.md',
        '11111111-2222-3333-4444-555555555555',
        'task',
        'Example Task',
        null,
        null,
        null,
        0,
        null,
        null,
        '0000000000000000000000000000000000000000000000000000000000000000',
        '2026-04-01T00:00:00.000Z',
        '2026-04-01T00:00:00.000Z',
        null,
        '{}'
      ]
    })

    await execute_sqlite_run({
      query: `INSERT INTO entity_embeddings (
        base_uri, chunk_index, content_hash, chunk_text, embedding, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      parameters: [
        'user:task/example.md',
        0,
        'hash1',
        'text1',
        Buffer.from([1, 2, 3]),
        '2026-04-01T00:00:00.000Z'
      ]
    })
    await execute_sqlite_run({
      query: `INSERT INTO entity_embeddings (
        base_uri, chunk_index, content_hash, chunk_text, embedding, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      parameters: [
        'user:task/example.md',
        1,
        'hash2',
        'text2',
        Buffer.from([4, 5, 6]),
        '2026-04-01T00:00:00.000Z'
      ]
    })
  })

  after(async () => {
    try {
      await close_sqlite_connection()
    } catch {
      // ignore
    }
  })

  it('preserves entity_embeddings rows across migration', async () => {
    const before_rows = await execute_sqlite_query({
      query: 'SELECT COUNT(*) AS n FROM entity_embeddings'
    })
    expect(before_rows[0].n).to.equal(2)

    await migrate_to_v8({
      user_base_directory: config.user_base_directory
    })

    const after_rows = await execute_sqlite_query({
      query: 'SELECT COUNT(*) AS n FROM entity_embeddings'
    })
    expect(after_rows[0].n).to.equal(2)
  })

  it('adds body column and populates it from the filesystem', async () => {
    const columns = await execute_sqlite_query({
      query: "PRAGMA table_info('entities')"
    })
    expect(columns.map((c) => c.name)).to.include('body')

    const rows = await execute_sqlite_query({
      query: 'SELECT body FROM entities WHERE base_uri = ?',
      parameters: ['user:task/example.md']
    })
    expect(rows[0].body).to.be.a('string')
    expect(rows[0].body).to.include('nano-community')
  })

  it('creates thread_timeline + thread_timeline_fts tables', async () => {
    const tables = await execute_sqlite_query({
      query: "SELECT name FROM sqlite_master WHERE type IN ('table') AND name LIKE 'thread_timeline%'"
    })
    const names = tables.map((t) => t.name)
    expect(names).to.include('thread_timeline')
    expect(names).to.include('thread_timeline_fts')
  })

  it('allows FTS5 MATCH queries against the rebuilt entities_fts, treating hyphen and space equivalently', async () => {
    const hyphen_rows = await execute_sqlite_query({
      query:
        'SELECT base_uri FROM entities_fts WHERE entities_fts MATCH ?',
      parameters: ['"nano-community"']
    })
    expect(hyphen_rows.map((r) => r.base_uri)).to.include(
      'user:task/example.md'
    )

    const space_rows = await execute_sqlite_query({
      query:
        'SELECT base_uri FROM entities_fts WHERE entities_fts MATCH ?',
      parameters: ['nano community']
    })
    expect(space_rows.map((r) => r.base_uri)).to.include(
      'user:task/example.md'
    )
  })

  it('advances SCHEMA_VERSION to the target', async () => {
    const version = await get_index_metadata({
      key: INDEX_METADATA_KEYS.SCHEMA_VERSION
    })
    expect(version).to.equal(TARGET_SCHEMA_VERSION)
  })

  it('noop-ish when re-run at the target version (does not throw)', async () => {
    await migrate_to_v8({
      user_base_directory: config.user_base_directory
    })
    const version = await get_index_metadata({
      key: INDEX_METADATA_KEYS.SCHEMA_VERSION
    })
    expect(version).to.equal(TARGET_SCHEMA_VERSION)
  })
})
