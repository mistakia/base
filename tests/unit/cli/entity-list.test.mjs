/**
 * @fileoverview Unit tests for entity-list CLI
 */

import { expect } from 'chai'

import {
  initialize_sqlite_client,
  close_sqlite_connection
} from '#libs-server/embedded-database-index/sqlite/sqlite-database-client.mjs'
import { create_sqlite_schema } from '#libs-server/embedded-database-index/sqlite/sqlite-schema-definitions.mjs'
import { upsert_entity_to_sqlite } from '#libs-server/embedded-database-index/sqlite/sqlite-entity-sync.mjs'
import {
  query_entities_from_sqlite,
  get_entity_by_base_uri,
  get_entity_by_id
} from '#libs-server/embedded-database-index/sqlite/sqlite-table-queries.mjs'

describe('Entity List CLI', function () {
  this.timeout(10000)

  before(async () => {
    await close_sqlite_connection()
    await initialize_sqlite_client({ in_memory: true })
    await create_sqlite_schema()

    // Insert test entities
    const test_entities = [
      {
        base_uri: 'user:task/test-task-1.md',
        entity_id: '11111111-1111-1111-1111-111111111111',
        type: 'task',
        frontmatter: {
          title: 'Test Task 1',
          status: 'In Progress',
          priority: 'High',
          user_public_key: 'test-key',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z'
        },
        user_public_key: 'test-key'
      },
      {
        base_uri: 'user:task/test-task-2.md',
        entity_id: '22222222-2222-2222-2222-222222222222',
        type: 'task',
        frontmatter: {
          title: 'Test Task 2',
          status: 'Completed',
          priority: 'Low',
          user_public_key: 'test-key',
          created_at: '2026-01-02T00:00:00.000Z',
          updated_at: '2026-01-02T00:00:00.000Z'
        },
        user_public_key: 'test-key'
      },
      {
        base_uri: 'user:guideline/test-guideline.md',
        entity_id: '33333333-3333-3333-3333-333333333333',
        type: 'guideline',
        frontmatter: {
          title: 'Test Guideline',
          user_public_key: 'test-key',
          created_at: '2026-01-03T00:00:00.000Z',
          updated_at: '2026-01-03T00:00:00.000Z'
        },
        user_public_key: 'test-key'
      }
    ]

    for (const entity of test_entities) {
      await upsert_entity_to_sqlite({ entity_data: entity })
    }
  })

  after(async () => {
    try {
      await close_sqlite_connection()
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('query_entities_from_sqlite', () => {
    it('should list all entities without filters', async () => {
      const entities = await query_entities_from_sqlite({
        filters: [],
        limit: 100
      })
      expect(entities).to.be.an('array')
      expect(entities.length).to.be.at.least(3)
    })

    it('should filter entities by type', async () => {
      const entities = await query_entities_from_sqlite({
        filters: [{ column_id: 'type', operator: 'IN', value: ['task'] }],
        limit: 100
      })
      expect(entities).to.be.an('array')
      expect(entities.length).to.equal(2)
      expect(entities.every((e) => e.type === 'task')).to.be.true
    })

    it('should filter entities by status', async () => {
      const entities = await query_entities_from_sqlite({
        filters: [{ column_id: 'status', operator: '=', value: 'In Progress' }],
        limit: 100
      })
      expect(entities).to.be.an('array')
      expect(entities.length).to.equal(1)
      expect(entities[0].status).to.equal('In Progress')
    })

    it('should filter entities by priority', async () => {
      const entities = await query_entities_from_sqlite({
        filters: [{ column_id: 'priority', operator: '=', value: 'High' }],
        limit: 100
      })
      expect(entities).to.be.an('array')
      expect(entities.length).to.equal(1)
      expect(entities[0].priority).to.equal('High')
    })

    it('should search entities by title', async () => {
      const entities = await query_entities_from_sqlite({
        filters: [{ column_id: 'title', operator: 'LIKE', value: 'Task 1' }],
        limit: 100
      })
      expect(entities).to.be.an('array')
      expect(entities.length).to.equal(1)
      expect(entities[0].title).to.include('Task 1')
    })

    it('should respect limit parameter', async () => {
      const entities = await query_entities_from_sqlite({
        filters: [],
        limit: 1
      })
      expect(entities).to.be.an('array')
      expect(entities.length).to.equal(1)
    })

    it('should sort entities', async () => {
      const entities = await query_entities_from_sqlite({
        filters: [{ column_id: 'type', operator: '=', value: 'task' }],
        sort: [{ column_id: 'title', desc: false }],
        limit: 100
      })
      expect(entities).to.be.an('array')
      expect(entities[0].title).to.equal('Test Task 1')
      expect(entities[1].title).to.equal('Test Task 2')
    })
  })

  describe('get_entity_by_base_uri', () => {
    it('should return entity by base_uri', async () => {
      const entity = await get_entity_by_base_uri({
        base_uri: 'user:task/test-task-1.md'
      })
      expect(entity).to.not.be.null
      expect(entity.base_uri).to.equal('user:task/test-task-1.md')
      expect(entity.title).to.equal('Test Task 1')
    })

    it('should return null for non-existent base_uri', async () => {
      const entity = await get_entity_by_base_uri({
        base_uri: 'user:task/non-existent.md'
      })
      expect(entity).to.be.null
    })
  })

  describe('get_entity_by_id', () => {
    it('should return entity by entity_id', async () => {
      const entity = await get_entity_by_id({
        entity_id: '11111111-1111-1111-1111-111111111111'
      })
      expect(entity).to.not.be.null
      expect(entity.entity_id).to.equal('11111111-1111-1111-1111-111111111111')
      expect(entity.title).to.equal('Test Task 1')
    })

    it('should return null for non-existent entity_id', async () => {
      const entity = await get_entity_by_id({
        entity_id: '99999999-9999-9999-9999-999999999999'
      })
      expect(entity).to.be.null
    })
  })
})
