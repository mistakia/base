/**
 * @fileoverview Integration tests for SQLite thread relation queries
 *
 * Tests the find_threads_relating_to() function that queries threads
 * by their relation targets.
 */

import { expect } from 'chai'

import {
  initialize_sqlite_client,
  close_sqlite_connection
} from '#libs-server/embedded-database-index/sqlite/sqlite-database-client.mjs'
import { create_sqlite_schema } from '#libs-server/embedded-database-index/sqlite/sqlite-schema-definitions.mjs'
import {
  upsert_entity_to_sqlite,
  upsert_thread_to_sqlite,
  sync_entity_relations_to_sqlite
} from '#libs-server/embedded-database-index/sqlite/sqlite-entity-sync.mjs'
import { find_threads_relating_to } from '#libs-server/embedded-database-index/sqlite/sqlite-relation-queries.mjs'

describe('SQLite Thread Relation Queries Integration', () => {
  before(async () => {
    await close_sqlite_connection()
    await initialize_sqlite_client({ in_memory: true })
    await create_sqlite_schema()

    // Create test entities (targets for relations)
    const test_entities = [
      {
        entity_id: 'task-1',
        base_uri: 'user:task/task-1.md',
        type: 'task',
        frontmatter: {
          entity_id: 'task-1',
          base_uri: 'user:task/task-1.md',
          type: 'task',
          title: 'First Task',
          status: 'open',
          created_at: '2025-01-01T10:00:00Z',
          updated_at: '2025-01-01T10:00:00Z',
          user_public_key: 'test-user'
        },
        user_public_key: 'test-user'
      },
      {
        entity_id: 'task-2',
        base_uri: 'user:task/task-2.md',
        type: 'task',
        frontmatter: {
          entity_id: 'task-2',
          base_uri: 'user:task/task-2.md',
          type: 'task',
          title: 'Second Task',
          status: 'completed',
          created_at: '2025-01-02T10:00:00Z',
          updated_at: '2025-01-02T10:00:00Z',
          user_public_key: 'test-user'
        },
        user_public_key: 'test-user'
      }
    ]

    for (const entity of test_entities) {
      await upsert_entity_to_sqlite({ entity_data: entity })
    }

    // Create test threads
    const test_threads = [
      {
        thread_id: 'thread-aaa-111',
        title: 'Thread that modifies task-1',
        thread_state: 'archived',
        created_at: '2025-01-01T10:00:00Z',
        updated_at: '2025-01-01T12:00:00Z'
      },
      {
        thread_id: 'thread-bbb-222',
        title: 'Thread that accesses task-1',
        thread_state: 'archived',
        created_at: '2025-01-02T10:00:00Z',
        updated_at: '2025-01-02T12:00:00Z'
      },
      {
        thread_id: 'thread-ccc-333',
        title: 'Thread that modifies task-2',
        thread_state: 'active',
        created_at: '2025-01-03T10:00:00Z',
        updated_at: '2025-01-03T12:00:00Z'
      },
      {
        thread_id: 'thread-ddd-444',
        title: 'Thread with no relations',
        thread_state: 'active',
        created_at: '2025-01-04T10:00:00Z',
        updated_at: '2025-01-04T12:00:00Z'
      }
    ]

    for (const thread of test_threads) {
      await upsert_thread_to_sqlite({ thread_data: thread })
    }

    // Create thread relations
    // thread-aaa-111 modifies task-1
    await sync_entity_relations_to_sqlite({
      source_base_uri: 'user:thread/thread-aaa-111',
      relations: [
        {
          target_base_uri: 'user:task/task-1.md',
          relation_type: 'modifies',
          context: 'Modified task implementation'
        }
      ]
    })

    // thread-bbb-222 accesses task-1
    await sync_entity_relations_to_sqlite({
      source_base_uri: 'user:thread/thread-bbb-222',
      relations: [
        {
          target_base_uri: 'user:task/task-1.md',
          relation_type: 'accesses',
          context: 'Read task for research'
        }
      ]
    })

    // thread-ccc-333 modifies task-2
    await sync_entity_relations_to_sqlite({
      source_base_uri: 'user:thread/thread-ccc-333',
      relations: [
        {
          target_base_uri: 'user:task/task-2.md',
          relation_type: 'modifies',
          context: 'Completed task implementation'
        }
      ]
    })
  })

  after(async () => {
    try {
      await close_sqlite_connection()
    } catch (error) {
      // Ignore cleanup errors
    }
  })

  describe('find_threads_relating_to', () => {
    it('should find threads relating to a specific entity', async () => {
      const threads = await find_threads_relating_to({
        base_uri: 'user:task/task-1.md'
      })

      expect(threads).to.be.an('array')
      expect(threads.length).to.equal(2)

      const thread_ids = threads.map((t) => t.thread_id)
      expect(thread_ids).to.include('thread-aaa-111')
      expect(thread_ids).to.include('thread-bbb-222')
    })

    it('should return thread metadata with each result', async () => {
      const threads = await find_threads_relating_to({
        base_uri: 'user:task/task-1.md'
      })

      const thread = threads.find((t) => t.thread_id === 'thread-aaa-111')
      expect(thread).to.exist
      expect(thread.title).to.equal('Thread that modifies task-1')
      expect(thread.thread_state).to.equal('archived')
      expect(thread.relation_type).to.equal('modifies')
      expect(thread.context).to.equal('Modified task implementation')
    })

    it('should filter by relation_type', async () => {
      const threads = await find_threads_relating_to({
        base_uri: 'user:task/task-1.md',
        relation_type: 'modifies'
      })

      expect(threads).to.be.an('array')
      expect(threads.length).to.equal(1)
      expect(threads[0].thread_id).to.equal('thread-aaa-111')
      expect(threads[0].relation_type).to.equal('modifies')
    })

    it('should return empty array for entity with no thread relations', async () => {
      const threads = await find_threads_relating_to({
        base_uri: 'user:task/non-existent.md'
      })

      expect(threads).to.be.an('array')
      expect(threads.length).to.equal(0)
    })

    it('should return empty array when base_uri is not provided', async () => {
      const threads = await find_threads_relating_to({
        base_uri: null
      })

      expect(threads).to.be.an('array')
      expect(threads.length).to.equal(0)
    })

    it('should apply limit parameter', async () => {
      const threads = await find_threads_relating_to({
        base_uri: 'user:task/task-1.md',
        limit: 1
      })

      expect(threads).to.be.an('array')
      expect(threads.length).to.equal(1)
    })

    it('should apply offset parameter', async () => {
      const all_threads = await find_threads_relating_to({
        base_uri: 'user:task/task-1.md'
      })

      const offset_threads = await find_threads_relating_to({
        base_uri: 'user:task/task-1.md',
        offset: 1
      })

      expect(offset_threads).to.be.an('array')
      expect(offset_threads.length).to.equal(1)
      // The offset thread should not be the first thread (they are ordered by updated_at DESC)
      expect(offset_threads[0].thread_id).to.not.equal(all_threads[0].thread_id)
    })

    it('should order results by updated_at descending', async () => {
      const threads = await find_threads_relating_to({
        base_uri: 'user:task/task-1.md'
      })

      expect(threads).to.be.an('array')
      expect(threads.length).to.equal(2)

      // thread-bbb-222 has later updated_at, should come first
      expect(threads[0].thread_id).to.equal('thread-bbb-222')
      expect(threads[1].thread_id).to.equal('thread-aaa-111')
    })

    it('should find threads relating to different entities', async () => {
      const threads_task1 = await find_threads_relating_to({
        base_uri: 'user:task/task-1.md'
      })

      const threads_task2 = await find_threads_relating_to({
        base_uri: 'user:task/task-2.md'
      })

      expect(threads_task1.length).to.equal(2)
      expect(threads_task2.length).to.equal(1)
      expect(threads_task2[0].thread_id).to.equal('thread-ccc-333')
    })
  })
})
