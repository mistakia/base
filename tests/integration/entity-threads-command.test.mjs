/**
 * @fileoverview Integration tests for entity threads command
 *
 * Tests the `base entity threads <base_uri>` command and related
 * API endpoint that shows threads relating to an entity.
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
import { format_entity_thread } from '#root/cli/base/lib/format.mjs'

describe('Entity Threads Command Integration', () => {
  before(async () => {
    await close_sqlite_connection()
    await initialize_sqlite_client({ in_memory: true })
    await create_sqlite_schema()

    // Create test entities (targets for thread relations)
    const test_entities = [
      {
        entity_id: 'entity-task-1',
        base_uri: 'user:task/sample-task.md',
        type: 'task',
        frontmatter: {
          entity_id: 'entity-task-1',
          base_uri: 'user:task/sample-task.md',
          type: 'task',
          title: 'Sample Task',
          status: 'In Progress',
          created_at: '2026-01-01T10:00:00Z',
          updated_at: '2026-01-15T10:00:00Z',
          user_public_key: 'test-user'
        },
        user_public_key: 'test-user'
      },
      {
        entity_id: 'entity-workflow-1',
        base_uri: 'user:workflow/sample-workflow.md',
        type: 'workflow',
        frontmatter: {
          entity_id: 'entity-workflow-1',
          base_uri: 'user:workflow/sample-workflow.md',
          type: 'workflow',
          title: 'Sample Workflow',
          created_at: '2026-01-01T10:00:00Z',
          updated_at: '2026-01-10T10:00:00Z',
          user_public_key: 'test-user'
        },
        user_public_key: 'test-user'
      }
    ]

    for (const entity of test_entities) {
      await upsert_entity_to_sqlite({ entity_data: entity })
    }

    // Create test threads with various states
    const test_threads = [
      {
        thread_id: 'thread-modify-task',
        title: 'Thread that modified the sample task',
        thread_state: 'archived',
        created_at: '2026-01-10T09:00:00Z',
        updated_at: '2026-01-10T17:00:00Z'
      },
      {
        thread_id: 'thread-access-task',
        title: 'Thread that accessed the sample task',
        thread_state: 'archived',
        created_at: '2026-01-12T09:00:00Z',
        updated_at: '2026-01-12T12:00:00Z'
      },
      {
        thread_id: 'thread-active-task',
        title: 'Active thread working on sample task',
        thread_state: 'active',
        created_at: '2026-01-14T09:00:00Z',
        updated_at: '2026-01-14T18:00:00Z'
      },
      {
        thread_id: 'thread-workflow-access',
        title: 'Thread that accessed the workflow',
        thread_state: 'archived',
        created_at: '2026-01-08T09:00:00Z',
        updated_at: '2026-01-08T11:00:00Z'
      },
      {
        thread_id: 'thread-unrelated',
        title: 'Thread with no entity relations',
        thread_state: 'active',
        created_at: '2026-01-05T09:00:00Z',
        updated_at: '2026-01-05T10:00:00Z'
      }
    ]

    for (const thread of test_threads) {
      await upsert_thread_to_sqlite({ thread_data: thread })
    }

    // Create thread-entity relations
    await sync_entity_relations_to_sqlite({
      source_base_uri: 'user:thread/thread-modify-task',
      relations: [
        {
          target_base_uri: 'user:task/sample-task.md',
          relation_type: 'modifies',
          context: 'Implemented feature for this task'
        }
      ]
    })

    await sync_entity_relations_to_sqlite({
      source_base_uri: 'user:thread/thread-access-task',
      relations: [
        {
          target_base_uri: 'user:task/sample-task.md',
          relation_type: 'accesses',
          context: 'Researched task requirements'
        }
      ]
    })

    await sync_entity_relations_to_sqlite({
      source_base_uri: 'user:thread/thread-active-task',
      relations: [
        {
          target_base_uri: 'user:task/sample-task.md',
          relation_type: 'modifies',
          context: 'Currently implementing changes'
        }
      ]
    })

    await sync_entity_relations_to_sqlite({
      source_base_uri: 'user:thread/thread-workflow-access',
      relations: [
        {
          target_base_uri: 'user:workflow/sample-workflow.md',
          relation_type: 'accesses',
          context: 'Read workflow definition'
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

  describe('find_threads_relating_to for entity threads', () => {
    it('should find all threads relating to a task entity', async () => {
      const threads = await find_threads_relating_to({
        base_uri: 'user:task/sample-task.md'
      })

      expect(threads).to.be.an('array')
      expect(threads.length).to.equal(3)

      const thread_ids = threads.map((t) => t.thread_id)
      expect(thread_ids).to.include('thread-modify-task')
      expect(thread_ids).to.include('thread-access-task')
      expect(thread_ids).to.include('thread-active-task')
    })

    it('should find threads relating to workflow entity', async () => {
      const threads = await find_threads_relating_to({
        base_uri: 'user:workflow/sample-workflow.md'
      })

      expect(threads).to.be.an('array')
      expect(threads.length).to.equal(1)
      expect(threads[0].thread_id).to.equal('thread-workflow-access')
    })

    it('should filter by relation_type modifies', async () => {
      const threads = await find_threads_relating_to({
        base_uri: 'user:task/sample-task.md',
        relation_type: 'modifies'
      })

      expect(threads).to.be.an('array')
      expect(threads.length).to.equal(2)

      const thread_ids = threads.map((t) => t.thread_id)
      expect(thread_ids).to.include('thread-modify-task')
      expect(thread_ids).to.include('thread-active-task')
    })

    it('should filter by relation_type accesses', async () => {
      const threads = await find_threads_relating_to({
        base_uri: 'user:task/sample-task.md',
        relation_type: 'accesses'
      })

      expect(threads).to.be.an('array')
      expect(threads.length).to.equal(1)
      expect(threads[0].thread_id).to.equal('thread-access-task')
    })

    it('should return empty array for entity with no thread relations', async () => {
      const threads = await find_threads_relating_to({
        base_uri: 'user:task/nonexistent-task.md'
      })

      expect(threads).to.be.an('array')
      expect(threads.length).to.equal(0)
    })

    it('should respect limit parameter', async () => {
      const threads = await find_threads_relating_to({
        base_uri: 'user:task/sample-task.md',
        limit: 2
      })

      expect(threads).to.be.an('array')
      expect(threads.length).to.equal(2)
    })

    it('should respect offset parameter', async () => {
      const all_threads = await find_threads_relating_to({
        base_uri: 'user:task/sample-task.md'
      })

      const offset_threads = await find_threads_relating_to({
        base_uri: 'user:task/sample-task.md',
        offset: 1
      })

      expect(offset_threads).to.be.an('array')
      expect(offset_threads.length).to.equal(2)
      // First result with offset should not match first result without offset
      expect(offset_threads[0].thread_id).to.not.equal(all_threads[0].thread_id)
    })
  })

  describe('format_entity_thread', () => {
    it('should format thread in default tab-separated output', () => {
      const thread = {
        thread_id: 'thread-123',
        thread_state: 'archived',
        relation_type: 'modifies',
        title: 'Test Thread Title'
      }

      const output = format_entity_thread(thread)
      expect(output).to.equal(
        'thread-123\tarchived\tmodifies\tTest Thread Title'
      )
    })

    it('should handle missing fields gracefully', () => {
      const thread = {
        thread_id: 'thread-456'
      }

      const output = format_entity_thread(thread)
      expect(output).to.equal('thread-456\t\t\t')
    })

    it('should format thread in verbose mode', () => {
      const thread = {
        thread_id: 'thread-789',
        title: 'Verbose Test Thread',
        thread_state: 'active',
        relation_type: 'accesses',
        created_at: '2026-01-15T10:00:00Z',
        updated_at: '2026-01-15T18:00:00Z'
      }

      const output = format_entity_thread(thread, { verbose: true })

      expect(output).to.include('thread-789')
      expect(output).to.include('Title: Verbose Test Thread')
      expect(output).to.include('State: active')
      expect(output).to.include('Relation: accesses')
      expect(output).to.include('Created: 2026-01-15')
      expect(output).to.include('Updated: 2026-01-15')
    })

    it('should format dates as YYYY-MM-DD in verbose mode', () => {
      const thread = {
        thread_id: 'thread-date-test',
        created_at: '2026-02-06T22:30:00.000Z',
        updated_at: '2026-02-07T01:05:00.000Z'
      }

      const output = format_entity_thread(thread, { verbose: true })

      expect(output).to.include('Created: 2026-02-06')
      expect(output).to.include('Updated: 2026-02-07')
    })
  })

  describe('thread state filtering (application level)', () => {
    it('should be possible to filter threads by state after query', async () => {
      const all_threads = await find_threads_relating_to({
        base_uri: 'user:task/sample-task.md'
      })

      // Filter for active threads
      const active_threads = all_threads.filter(
        (t) => t.thread_state === 'active'
      )
      expect(active_threads.length).to.equal(1)
      expect(active_threads[0].thread_id).to.equal('thread-active-task')

      // Filter for archived threads
      const archived_threads = all_threads.filter(
        (t) => t.thread_state === 'archived'
      )
      expect(archived_threads.length).to.equal(2)
    })
  })
})
