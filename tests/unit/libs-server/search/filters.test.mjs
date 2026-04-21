import { expect } from 'chai'

import {
  initialize_sqlite_client,
  execute_sqlite_run,
  close_sqlite_connection
} from '#libs-server/embedded-database-index/sqlite/sqlite-database-client.mjs'
import { apply_filters } from '#libs-server/search/filters.mjs'

async function seed_schema() {
  await execute_sqlite_run({
    query: `CREATE TABLE entities (
      base_uri TEXT PRIMARY KEY,
      entity_id TEXT,
      type TEXT,
      status TEXT,
      user_public_key TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT '',
      frontmatter TEXT NOT NULL DEFAULT '{}'
    )`
  })
  await execute_sqlite_run({
    query: `CREATE TABLE entity_tags (
      entity_base_uri TEXT NOT NULL,
      tag_base_uri TEXT NOT NULL,
      PRIMARY KEY (entity_base_uri, tag_base_uri)
    )`
  })
  await execute_sqlite_run({
    query: `CREATE TABLE thread_tags (
      thread_id TEXT NOT NULL,
      tag_base_uri TEXT NOT NULL,
      PRIMARY KEY (thread_id, tag_base_uri)
    )`
  })
}

describe('search filters', function () {
  this.timeout(5000)

  before(async () => {
    await close_sqlite_connection()
    await initialize_sqlite_client({ in_memory: true })
    await seed_schema()

    await execute_sqlite_run({
      query:
        'INSERT INTO entities (base_uri, entity_id, type, status) VALUES (?, ?, ?, ?)',
      parameters: ['user:task/a.md', 'a', 'task', 'In Progress']
    })
    await execute_sqlite_run({
      query:
        'INSERT INTO entities (base_uri, entity_id, type, status) VALUES (?, ?, ?, ?)',
      parameters: ['user:task/b.md', 'b', 'task', 'Completed']
    })
    await execute_sqlite_run({
      query:
        'INSERT INTO entities (base_uri, entity_id, type, status) VALUES (?, ?, ?, ?)',
      parameters: ['user:workflow/w.md', 'w', 'workflow', null]
    })
    await execute_sqlite_run({
      query:
        'INSERT INTO entity_tags (entity_base_uri, tag_base_uri) VALUES (?, ?)',
      parameters: ['user:task/a.md', 'user:tag/alpha.md']
    })
    await execute_sqlite_run({
      query:
        'INSERT INTO thread_tags (thread_id, tag_base_uri) VALUES (?, ?)',
      parameters: ['thr-1', 'user:tag/alpha.md']
    })
  })

  after(async () => {
    try {
      await close_sqlite_connection()
    } catch {
      // ignore
    }
  })

  const hits = () => [
    {
      entity_uri: 'user:task/a.md',
      raw_score: 1,
      source: 'entity',
      type: 'task',
      status: 'In Progress'
    },
    {
      entity_uri: 'user:task/b.md',
      raw_score: 1,
      source: 'entity',
      type: 'task',
      status: 'Completed'
    },
    {
      entity_uri: 'user:workflow/w.md',
      raw_score: 1,
      source: 'entity',
      type: 'workflow',
      status: null
    },
    {
      entity_uri: 'user:thread/thr-1',
      raw_score: 1,
      source: 'thread_metadata',
      type: 'thread',
      status: null
    }
  ]

  it('passes through when no filters are supplied', async () => {
    const out = await apply_filters({ hits: hits(), filters: {} })
    expect(out.map((h) => h.entity_uri)).to.have.members([
      'user:task/a.md',
      'user:task/b.md',
      'user:workflow/w.md',
      'user:thread/thr-1'
    ])
  })

  it('filters by entity type and treats thread URIs as type "thread"', async () => {
    const out = await apply_filters({
      hits: hits(),
      filters: { type: ['task', 'thread'] }
    })
    expect(out.map((h) => h.entity_uri)).to.have.members([
      'user:task/a.md',
      'user:task/b.md',
      'user:thread/thr-1'
    ])
  })

  it('filters by status and drops threads when status is requested', async () => {
    const out = await apply_filters({
      hits: hits(),
      filters: { status: ['In Progress'] }
    })
    expect(out.map((h) => h.entity_uri)).to.deep.equal(['user:task/a.md'])
  })

  it('filters by tag against both entity and thread tag tables', async () => {
    const out = await apply_filters({
      hits: hits(),
      filters: { tag: ['user:tag/alpha.md'] }
    })
    expect(out.map((h) => h.entity_uri)).to.have.members([
      'user:task/a.md',
      'user:thread/thr-1'
    ])
  })

  it('filters by path glob against entity_uri', async () => {
    const out = await apply_filters({
      hits: hits(),
      filters: { path: 'user:task/*.md' }
    })
    expect(out.map((h) => h.entity_uri)).to.have.members([
      'user:task/a.md',
      'user:task/b.md'
    ])
  })
})
