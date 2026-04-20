/**
 * Unit tests for entity alias sync and dangling-reference detection.
 * Uses in-memory SQLite so the sync projections can be exercised without a
 * full filesystem round-trip.
 */

import { expect } from 'chai'

import {
  initialize_sqlite_client,
  execute_sqlite_query,
  execute_sqlite_run,
  close_sqlite_connection
} from '#libs-server/embedded-database-index/sqlite/sqlite-database-client.mjs'
import {
  create_sqlite_schema,
  drop_sqlite_schema
} from '#libs-server/embedded-database-index/sqlite/sqlite-schema-definitions.mjs'
import {
  sync_entity_aliases_to_sqlite,
  sync_entity_content_wikilinks_to_sqlite
} from '#libs-server/embedded-database-index/sqlite/sqlite-entity-sync.mjs'

describe('entity_aliases sync', () => {
  before(async () => {
    await close_sqlite_connection()
    await initialize_sqlite_client({ in_memory: true })
    await create_sqlite_schema()
  })

  after(async () => {
    try {
      await drop_sqlite_schema()
    } catch {
      // ignore
    }
    await close_sqlite_connection()
  })

  beforeEach(async () => {
    await execute_sqlite_run({ query: 'DELETE FROM entity_aliases' })
    await execute_sqlite_run({ query: 'DELETE FROM entities' })
    await execute_sqlite_run({
      query: 'DELETE FROM entity_content_wikilinks'
    })
  })

  it('inserts alias rows for new frontmatter aliases', async () => {
    await sync_entity_aliases_to_sqlite({
      entity_base_uri: 'user:task/b.md',
      entity_id: 'id-1',
      alias_base_uris: ['user:task/a.md']
    })

    const rows = await execute_sqlite_query({
      query: 'SELECT alias_base_uri, current_base_uri FROM entity_aliases'
    })
    expect(rows).to.have.lengthOf(1)
    expect(rows[0].alias_base_uri).to.equal('user:task/a.md')
    expect(rows[0].current_base_uri).to.equal('user:task/b.md')
  })

  it('updates current_base_uri on multi-hop moves (A -> B -> C)', async () => {
    await sync_entity_aliases_to_sqlite({
      entity_base_uri: 'user:task/b.md',
      entity_id: 'id-1',
      alias_base_uris: ['user:task/a.md']
    })
    await sync_entity_aliases_to_sqlite({
      entity_base_uri: 'user:task/c.md',
      entity_id: 'id-1',
      alias_base_uris: ['user:task/a.md', 'user:task/b.md']
    })

    const rows = await execute_sqlite_query({
      query: `SELECT alias_base_uri, current_base_uri FROM entity_aliases
              ORDER BY alias_base_uri`
    })
    expect(rows).to.have.lengthOf(2)
    expect(rows[0]).to.deep.include({
      alias_base_uri: 'user:task/a.md',
      current_base_uri: 'user:task/c.md'
    })
    expect(rows[1]).to.deep.include({
      alias_base_uri: 'user:task/b.md',
      current_base_uri: 'user:task/c.md'
    })
  })

  it('prunes aliases removed from the frontmatter', async () => {
    await sync_entity_aliases_to_sqlite({
      entity_base_uri: 'user:task/b.md',
      entity_id: 'id-1',
      alias_base_uris: ['user:task/a.md']
    })
    await sync_entity_aliases_to_sqlite({
      entity_base_uri: 'user:task/b.md',
      entity_id: 'id-1',
      alias_base_uris: []
    })
    const rows = await execute_sqlite_query({
      query: 'SELECT * FROM entity_aliases'
    })
    expect(rows).to.have.lengthOf(0)
  })

  it('ignores self-referential aliases', async () => {
    await sync_entity_aliases_to_sqlite({
      entity_base_uri: 'user:task/b.md',
      entity_id: 'id-1',
      alias_base_uris: ['user:task/b.md']
    })
    const rows = await execute_sqlite_query({
      query: 'SELECT * FROM entity_aliases'
    })
    expect(rows).to.have.lengthOf(0)
  })
})

describe('validate-references SQL', () => {
  before(async () => {
    await close_sqlite_connection()
    await initialize_sqlite_client({ in_memory: true })
    await create_sqlite_schema()
  })

  after(async () => {
    await close_sqlite_connection()
  })

  beforeEach(async () => {
    for (const table of [
      'entity_relations',
      'entity_tags',
      'entity_content_wikilinks',
      'thread_references',
      'entity_aliases',
      'entities'
    ]) {
      await execute_sqlite_run({ query: `DELETE FROM ${table}` })
    }
  })

  const insert_entity = async ({ base_uri, entity_id, type = 'task' }) => {
    await execute_sqlite_run({
      query: `INSERT INTO entities (base_uri, entity_id, type, user_public_key, created_at, updated_at, frontmatter)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
      parameters: [
        base_uri,
        entity_id,
        type,
        'test-key',
        '2026-01-01T00:00:00Z',
        '2026-01-01T00:00:00Z',
        '{}'
      ]
    })
  }

  const dangling_sql = `
    WITH known_uris AS (
      SELECT base_uri AS uri FROM entities
      UNION SELECT alias_base_uri AS uri FROM entity_aliases
    ),
    link_sources AS (
      SELECT 'relation' AS source_kind, source_base_uri AS source, target_base_uri AS target FROM entity_relations
      UNION ALL
      SELECT 'tag', entity_base_uri, tag_base_uri FROM entity_tags
      UNION ALL
      SELECT 'content-wikilink', source_base_uri, target_base_uri FROM entity_content_wikilinks
      UNION ALL
      SELECT 'thread-metadata', 'user:thread/' || thread_id, target_base_uri FROM thread_references
    )
    SELECT source_kind, source, target FROM link_sources
    WHERE target NOT IN (SELECT uri FROM known_uris)
    ORDER BY source_kind, source
  `

  it('returns no rows when every link target exists as an entity', async () => {
    await insert_entity({ base_uri: 'user:task/a.md', entity_id: 'id-a' })
    await insert_entity({ base_uri: 'user:task/b.md', entity_id: 'id-b' })
    await sync_entity_content_wikilinks_to_sqlite({
      source_base_uri: 'user:task/a.md',
      target_base_uris: ['user:task/b.md']
    })
    const rows = await execute_sqlite_query({ query: dangling_sql })
    expect(rows).to.have.lengthOf(0)
  })

  it('flags dangling inline content wikilinks', async () => {
    await insert_entity({ base_uri: 'user:task/a.md', entity_id: 'id-a' })
    await sync_entity_content_wikilinks_to_sqlite({
      source_base_uri: 'user:task/a.md',
      target_base_uris: ['user:task/missing.md']
    })
    const rows = await execute_sqlite_query({ query: dangling_sql })
    expect(rows).to.have.lengthOf(1)
    expect(rows[0]).to.deep.include({
      source_kind: 'content-wikilink',
      source: 'user:task/a.md',
      target: 'user:task/missing.md'
    })
  })

  it('rescues a dangling link via entity_aliases', async () => {
    await insert_entity({ base_uri: 'user:task/current.md', entity_id: 'id-1' })
    await sync_entity_aliases_to_sqlite({
      entity_base_uri: 'user:task/current.md',
      entity_id: 'id-1',
      alias_base_uris: ['user:task/previous.md']
    })
    await sync_entity_content_wikilinks_to_sqlite({
      source_base_uri: 'user:task/a.md',
      target_base_uris: ['user:task/previous.md']
    })
    const rows = await execute_sqlite_query({ query: dangling_sql })
    expect(rows).to.have.lengthOf(0)
  })

  it('flags dangling thread-metadata references', async () => {
    await execute_sqlite_run({
      query: `INSERT INTO thread_references (thread_id, target_base_uri, location)
              VALUES ('thread-1', 'user:task/missing.md', 'metadata.relations')`
    })
    const rows = await execute_sqlite_query({ query: dangling_sql })
    expect(rows).to.have.lengthOf(1)
    expect(rows[0]).to.deep.include({
      source_kind: 'thread-metadata',
      source: 'user:thread/thread-1',
      target: 'user:task/missing.md'
    })
  })
})
