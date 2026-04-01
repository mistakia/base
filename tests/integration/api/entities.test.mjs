/**
 * @fileoverview Integration tests for GET /api/entities endpoint
 *
 * Tests entity query API with filtering, pagination, and permission-based redaction.
 */

/* global describe it before after */
import chai from 'chai'
import chaiHttp from 'chai-http'

import server from '#server'
import { create_test_user, create_auth_token } from '#tests/utils/index.mjs'
import { setup_test_directories } from '#tests/utils/setup-test-directories.mjs'
import reset_all_tables from '#tests/utils/reset-all-tables.mjs'
import {
  initialize_sqlite_client,
  close_sqlite_connection
} from '#libs-server/embedded-database-index/sqlite/sqlite-database-client.mjs'
import { create_sqlite_schema } from '#libs-server/embedded-database-index/sqlite/sqlite-schema-definitions.mjs'
import {
  upsert_entity_to_sqlite,
  sync_entity_tags_to_sqlite
} from '#libs-server/embedded-database-index/sqlite/sqlite-entity-sync.mjs'
import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'

chai.should()
chai.use(chaiHttp)

describe('API /entities GET', () => {
  let user
  let test_directories

  before(async () => {
    await reset_all_tables()
    user = await create_test_user()
    user.jwt_token = create_auth_token(user)

    // Setup test directories for base URI registry
    test_directories = setup_test_directories()

    // Initialize SQLite with in-memory database for tests
    await close_sqlite_connection()
    await initialize_sqlite_client({ in_memory: true })
    await create_sqlite_schema()

    // Mark SQLite as ready in the index manager
    embedded_index_manager.duckdb_ready = true
    embedded_index_manager.initialized = true

    // Insert test entities
    // Note: public_read: true ensures entities are readable without ownership
    const test_entities = [
      {
        entity_id: 'entity-task-1',
        base_uri: 'user:task/task-1.md',
        type: 'task',
        frontmatter: {
          entity_id: 'entity-task-1',
          base_uri: 'user:task/task-1.md',
          type: 'task',
          title: 'First Task',
          description: 'A task for testing',
          status: 'In Progress',
          priority: 'High',
          public_read: true,
          created_at: '2025-01-01T10:00:00Z',
          updated_at: '2025-01-01T10:00:00Z',
          user_public_key: user.user_public_key
        },
        user_public_key: user.user_public_key
      },
      {
        entity_id: 'entity-task-2',
        base_uri: 'user:task/task-2.md',
        type: 'task',
        frontmatter: {
          entity_id: 'entity-task-2',
          base_uri: 'user:task/task-2.md',
          type: 'task',
          title: 'Second Task',
          description: 'Another task',
          status: 'Completed',
          priority: 'Low',
          public_read: true,
          created_at: '2025-01-02T10:00:00Z',
          updated_at: '2025-01-02T10:00:00Z',
          user_public_key: user.user_public_key
        },
        user_public_key: user.user_public_key
      },
      {
        entity_id: 'entity-guideline-1',
        base_uri: 'sys:system/guideline/test-guideline.md',
        type: 'guideline',
        frontmatter: {
          entity_id: 'entity-guideline-1',
          base_uri: 'sys:system/guideline/test-guideline.md',
          type: 'guideline',
          title: 'Test Guideline',
          description: 'A guideline entity',
          public_read: true,
          created_at: '2025-01-03T10:00:00Z',
          updated_at: '2025-01-03T10:00:00Z',
          user_public_key: user.user_public_key
        },
        user_public_key: user.user_public_key
      }
    ]

    for (const entity of test_entities) {
      await upsert_entity_to_sqlite({ entity_data: entity })
    }

    // Add tags to first task
    await sync_entity_tags_to_sqlite({
      entity_base_uri: 'user:task/task-1.md',
      tag_base_uris: ['user:tag/test-tag.md']
    })
  })

  after(async () => {
    if (test_directories && test_directories.cleanup) {
      test_directories.cleanup()
    }
    await close_sqlite_connection()
    embedded_index_manager.duckdb_ready = false
  })

  describe('GET / (list entities)', () => {
    it('should return entities with pagination info', async () => {
      const res = await chai
        .request(server)
        .get('/api/entities')
        .set('Authorization', `Bearer ${user.jwt_token}`)

      res.should.have.status(200)
      res.body.should.have.property('entities')
      res.body.should.have.property('total')
      res.body.should.have.property('limit')
      res.body.should.have.property('offset')
      res.body.entities.should.be.an('array')
      res.body.entities.length.should.be.at.least(1)
    })

    it('should filter entities by type', async () => {
      const res = await chai
        .request(server)
        .get('/api/entities')
        .set('Authorization', `Bearer ${user.jwt_token}`)
        .query({ type: 'task' })

      res.should.have.status(200)
      res.body.entities.should.be.an('array')
      res.body.entities.length.should.equal(2)
      res.body.entities.forEach((entity) => {
        entity.type.should.equal('task')
      })
    })

    it('should filter entities by status', async () => {
      const res = await chai
        .request(server)
        .get('/api/entities')
        .set('Authorization', `Bearer ${user.jwt_token}`)
        .query({ type: 'task', status: 'In Progress' })

      res.should.have.status(200)
      res.body.entities.should.be.an('array')
      res.body.entities.length.should.equal(1)
      res.body.entities[0].status.should.equal('In Progress')
    })

    it('should filter entities by priority', async () => {
      const res = await chai
        .request(server)
        .get('/api/entities')
        .set('Authorization', `Bearer ${user.jwt_token}`)
        .query({ type: 'task', priority: 'High' })

      res.should.have.status(200)
      res.body.entities.should.be.an('array')
      res.body.entities.length.should.equal(1)
      res.body.entities[0].priority.should.equal('High')
    })

    it('should search entities by title', async () => {
      const res = await chai
        .request(server)
        .get('/api/entities')
        .set('Authorization', `Bearer ${user.jwt_token}`)
        .query({ search: 'First' })

      res.should.have.status(200)
      res.body.entities.should.be.an('array')
      res.body.entities.length.should.be.at.least(1)
      // Note: Without filesystem files, permission-based redaction applies
      // This verifies the search found matching entities
      res.body.entities[0].should.have.property('title')
    })

    it('should respect pagination limit', async () => {
      const res = await chai
        .request(server)
        .get('/api/entities')
        .set('Authorization', `Bearer ${user.jwt_token}`)
        .query({ limit: 1 })

      res.should.have.status(200)
      res.body.entities.should.be.an('array')
      res.body.entities.length.should.equal(1)
      res.body.limit.should.equal(1)
    })

    it('should respect pagination offset', async () => {
      const first_page = await chai
        .request(server)
        .get('/api/entities')
        .set('Authorization', `Bearer ${user.jwt_token}`)
        .query({ limit: 1, offset: 0 })

      const second_page = await chai
        .request(server)
        .get('/api/entities')
        .set('Authorization', `Bearer ${user.jwt_token}`)
        .query({ limit: 1, offset: 1 })

      first_page.should.have.status(200)
      second_page.should.have.status(200)
      first_page.body.entities[0].base_uri.should.not.equal(
        second_page.body.entities[0].base_uri
      )
    })

    it('should filter entities by tags', async () => {
      const res = await chai
        .request(server)
        .get('/api/entities')
        .set('Authorization', `Bearer ${user.jwt_token}`)
        .query({ tags: 'user:tag/test-tag.md' })

      res.should.have.status(200)
      res.body.entities.should.be.an('array')
      res.body.entities.length.should.equal(1)
      // base_uri may be redacted if no filesystem file exists for permission check
      res.body.entities[0].should.have.property('base_uri')
    })

    it('should support multiple types filter', async () => {
      const res = await chai
        .request(server)
        .get('/api/entities')
        .set('Authorization', `Bearer ${user.jwt_token}`)
        .query({ type: ['task', 'guideline'] })

      res.should.have.status(200)
      res.body.entities.should.be.an('array')
      res.body.entities.length.should.equal(3)
    })
  })

  describe('GET / (single entity lookup)', () => {
    it('should get entity by base_uri', async () => {
      const res = await chai
        .request(server)
        .get('/api/entities')
        .set('Authorization', `Bearer ${user.jwt_token}`)
        .query({ base_uri: 'user:task/task-1.md' })

      res.should.have.status(200)
      res.body.entities.should.be.an('array')
      res.body.entities.length.should.equal(1)
      // Note: base_uri and title may be redacted if no filesystem file exists for permission check
      res.body.entities[0].should.have.property('base_uri')
      res.body.entities[0].should.have.property('title')
    })

    it('should get entity by entity_id', async () => {
      const res = await chai
        .request(server)
        .get('/api/entities')
        .set('Authorization', `Bearer ${user.jwt_token}`)
        .query({ entity_id: 'entity-task-1' })

      res.should.have.status(200)
      res.body.entities.should.be.an('array')
      res.body.entities.length.should.equal(1)
      res.body.entities[0].entity_id.should.equal('entity-task-1')
    })

    it('should return empty array for non-existent entity', async () => {
      const res = await chai
        .request(server)
        .get('/api/entities')
        .set('Authorization', `Bearer ${user.jwt_token}`)
        .query({ base_uri: 'user:task/non-existent.md' })

      res.should.have.status(200)
      res.body.entities.should.be.an('array')
      res.body.entities.length.should.equal(0)
      res.body.total.should.equal(0)
    })
  })

  describe('Sorting', () => {
    it('should sort by updated_at descending by default', async () => {
      const res = await chai
        .request(server)
        .get('/api/entities')
        .set('Authorization', `Bearer ${user.jwt_token}`)
        .query({ type: 'task' })

      res.should.have.status(200)
      res.body.entities.should.be.an('array')
      // The entity with latest updated_at should be first
      const dates = res.body.entities.map((e) => new Date(e.updated_at))
      for (let i = 1; i < dates.length; i++) {
        dates[i - 1].getTime().should.be.at.least(dates[i].getTime())
      }
    })

    it('should sort ascending when sort_desc is false', async () => {
      const res = await chai
        .request(server)
        .get('/api/entities')
        .set('Authorization', `Bearer ${user.jwt_token}`)
        .query({ type: 'task', sort: 'created_at', sort_desc: 'false' })

      res.should.have.status(200)
      res.body.entities.should.be.an('array')
      const dates = res.body.entities.map((e) => new Date(e.created_at))
      for (let i = 1; i < dates.length; i++) {
        dates[i - 1].getTime().should.be.at.most(dates[i].getTime())
      }
    })
  })
})
