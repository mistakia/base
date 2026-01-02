/**
 * @fileoverview Integration tests for DuckDB table queries
 */

import { expect } from 'chai'

import {
  initialize_duckdb_client,
  close_duckdb_connection
} from '#libs-server/embedded-database-index/duckdb/duckdb-database-client.mjs'
import { create_duckdb_schema } from '#libs-server/embedded-database-index/duckdb/duckdb-schema-definitions.mjs'
import {
  upsert_task_to_duckdb,
  upsert_thread_to_duckdb
} from '#libs-server/embedded-database-index/duckdb/duckdb-entity-sync.mjs'
import {
  query_tasks_from_duckdb,
  query_threads_from_duckdb,
  count_tasks_in_duckdb,
  count_threads_in_duckdb
} from '#libs-server/embedded-database-index/duckdb/duckdb-table-queries.mjs'

describe('DuckDB Table Queries Integration', () => {
  before(async () => {
    // Initialize DuckDB with in-memory database for tests
    await initialize_duckdb_client({ in_memory: true })

    // Create schema (connection is implicit, passed as placeholder)
    await create_duckdb_schema({ connection: null })

    // Insert test data
    const test_tasks = [
      {
        entity_id: 'task-1',
        base_uri: 'user:task/task-1.md',
        title: 'First Task',
        status: 'open',
        priority: 'High',
        created_at: '2025-01-01T10:00:00Z',
        updated_at: '2025-01-01T10:00:00Z'
      },
      {
        entity_id: 'task-2',
        base_uri: 'user:task/task-2.md',
        title: 'Second Task',
        status: 'completed',
        priority: 'Low',
        created_at: '2025-01-02T10:00:00Z',
        updated_at: '2025-01-02T10:00:00Z'
      },
      {
        entity_id: 'task-3',
        base_uri: 'user:task/task-3.md',
        title: 'Third Task',
        status: 'open',
        priority: 'Medium',
        created_at: '2025-01-03T10:00:00Z',
        updated_at: '2025-01-03T10:00:00Z'
      }
    ]

    for (const task of test_tasks) {
      await upsert_task_to_duckdb({ connection: null, task_data: task })
    }

    const test_threads = [
      {
        thread_id: 'thread-1',
        title: 'First Thread',
        thread_state: 'active',
        created_at: '2025-01-01T10:00:00Z',
        updated_at: '2025-01-01T10:00:00Z',
        message_count: 10,
        total_input_tokens: 3000,
        total_output_tokens: 2000
      },
      {
        thread_id: 'thread-2',
        title: 'Second Thread',
        thread_state: 'archived',
        created_at: '2025-01-02T10:00:00Z',
        updated_at: '2025-01-02T10:00:00Z',
        message_count: 5,
        total_input_tokens: 1500,
        total_output_tokens: 1000
      }
    ]

    for (const thread of test_threads) {
      await upsert_thread_to_duckdb({ connection: null, thread_data: thread })
    }
  })

  after(async () => {
    await close_duckdb_connection()
  })

  describe('query_tasks_from_duckdb', () => {
    it('should query all tasks without filters', async () => {
      const tasks = await query_tasks_from_duckdb({
        connection: null,
        filters: [],
        sort: [{ column_id: 'created_at', desc: true }],
        limit: 100,
        offset: 0
      })

      expect(tasks).to.be.an('array')
      expect(tasks.length).to.equal(3)
    })

    it('should filter tasks by status', async () => {
      const tasks = await query_tasks_from_duckdb({
        connection: null,
        filters: [{ column_id: 'status', operator: '=', value: 'open' }],
        sort: [{ column_id: 'created_at', desc: true }],
        limit: 100,
        offset: 0
      })

      expect(tasks).to.be.an('array')
      expect(tasks.length).to.equal(2)
      tasks.forEach((task) => {
        expect(task.status).to.equal('open')
      })
    })

    it('should filter tasks by priority', async () => {
      const tasks = await query_tasks_from_duckdb({
        connection: null,
        filters: [{ column_id: 'priority', operator: '=', value: 'High' }],
        sort: [],
        limit: 100,
        offset: 0
      })

      expect(tasks).to.be.an('array')
      expect(tasks.length).to.equal(1)
      expect(tasks[0].priority).to.equal('High')
    })

    it('should sort tasks by created_at ascending', async () => {
      const tasks = await query_tasks_from_duckdb({
        connection: null,
        filters: [],
        sort: [{ column_id: 'created_at', desc: false }],
        limit: 100,
        offset: 0
      })

      expect(tasks).to.be.an('array')
      expect(tasks[0].entity_id).to.equal('task-1')
      expect(tasks[2].entity_id).to.equal('task-3')
    })

    it('should apply pagination with limit and offset', async () => {
      const first_page = await query_tasks_from_duckdb({
        connection: null,
        filters: [],
        sort: [{ column_id: 'created_at', desc: false }],
        limit: 2,
        offset: 0
      })

      expect(first_page).to.be.an('array')
      expect(first_page.length).to.equal(2)

      const second_page = await query_tasks_from_duckdb({
        connection: null,
        filters: [],
        sort: [{ column_id: 'created_at', desc: false }],
        limit: 2,
        offset: 2
      })

      expect(second_page).to.be.an('array')
      expect(second_page.length).to.equal(1)
    })
  })

  describe('count_tasks_in_duckdb', () => {
    it('should count all tasks without filters', async () => {
      const count = await count_tasks_in_duckdb({
        connection: null,
        filters: []
      })

      expect(count).to.equal(3)
    })

    it('should count tasks with filters', async () => {
      const count = await count_tasks_in_duckdb({
        connection: null,
        filters: [{ column_id: 'status', operator: '=', value: 'open' }]
      })

      expect(count).to.equal(2)
    })
  })

  describe('query_threads_from_duckdb', () => {
    it('should query all threads without filters', async () => {
      const threads = await query_threads_from_duckdb({
        connection: null,
        filters: [],
        sort: [{ column_id: 'created_at', desc: true }],
        limit: 100,
        offset: 0
      })

      expect(threads).to.be.an('array')
      expect(threads.length).to.equal(2)
    })

    it('should filter threads by state', async () => {
      const threads = await query_threads_from_duckdb({
        connection: null,
        filters: [
          { column_id: 'thread_state', operator: '=', value: 'active' }
        ],
        sort: [],
        limit: 100,
        offset: 0
      })

      expect(threads).to.be.an('array')
      expect(threads.length).to.equal(1)
      expect(threads[0].thread_state).to.equal('active')
    })
  })

  describe('count_threads_in_duckdb', () => {
    it('should count all threads without filters', async () => {
      const count = await count_threads_in_duckdb({
        connection: null,
        filters: []
      })

      expect(count).to.equal(2)
    })

    it('should count threads with filters', async () => {
      const count = await count_threads_in_duckdb({
        connection: null,
        filters: [
          { column_id: 'thread_state', operator: '=', value: 'archived' }
        ]
      })

      expect(count).to.equal(1)
    })
  })
})
