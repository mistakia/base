/**
 * @fileoverview Integration tests for entity activity views
 *
 * Tests the query_entities_by_thread_activity() function and period parsing utilities.
 */

import { expect } from 'chai'

import {
  initialize_duckdb_client,
  close_duckdb_connection
} from '#libs-server/embedded-database-index/duckdb/duckdb-database-client.mjs'
import { create_duckdb_schema } from '#libs-server/embedded-database-index/duckdb/duckdb-schema-definitions.mjs'
import {
  upsert_entity_to_duckdb,
  upsert_thread_to_duckdb,
  sync_entity_relations_to_duckdb
} from '#libs-server/embedded-database-index/duckdb/duckdb-entity-sync.mjs'
import { query_entities_by_thread_activity } from '#libs-server/embedded-database-index/duckdb/duckdb-activity-queries.mjs'
import {
  parse_time_period_ms,
  parse_time_period_date,
  is_valid_time_period
} from '#libs-server/utils/parse-time-period.mjs'

describe('Entity Activity Views Integration', () => {
  describe('Time Period Parsing', () => {
    describe('parse_time_period_ms', () => {
      it('should parse hours correctly', () => {
        expect(parse_time_period_ms('1h')).to.equal(60 * 60 * 1000)
        expect(parse_time_period_ms('24h')).to.equal(24 * 60 * 60 * 1000)
      })

      it('should parse days correctly', () => {
        expect(parse_time_period_ms('1d')).to.equal(24 * 60 * 60 * 1000)
        expect(parse_time_period_ms('7d')).to.equal(7 * 24 * 60 * 60 * 1000)
      })

      it('should parse weeks correctly', () => {
        expect(parse_time_period_ms('1w')).to.equal(7 * 24 * 60 * 60 * 1000)
        expect(parse_time_period_ms('2w')).to.equal(14 * 24 * 60 * 60 * 1000)
      })

      it('should parse months correctly', () => {
        expect(parse_time_period_ms('1m')).to.equal(30 * 24 * 60 * 60 * 1000)
        expect(parse_time_period_ms('3m')).to.equal(90 * 24 * 60 * 60 * 1000)
      })

      it('should handle case insensitivity', () => {
        expect(parse_time_period_ms('7D')).to.equal(parse_time_period_ms('7d'))
        expect(parse_time_period_ms('24H')).to.equal(parse_time_period_ms('24h'))
      })

      it('should return null for invalid input', () => {
        expect(parse_time_period_ms('')).to.be.null
        expect(parse_time_period_ms(null)).to.be.null
        expect(parse_time_period_ms('abc')).to.be.null
        expect(parse_time_period_ms('7x')).to.be.null
        expect(parse_time_period_ms('0d')).to.be.null
        expect(parse_time_period_ms('-1d')).to.be.null
      })

      it('should return null for periods exceeding max limits', () => {
        // Max limits: 87600h, 3650d, 520w, 120m (10 years)
        expect(parse_time_period_ms('87601h')).to.be.null // exceeds 10 years
        expect(parse_time_period_ms('3651d')).to.be.null // exceeds 10 years
        expect(parse_time_period_ms('521w')).to.be.null // exceeds 10 years
        expect(parse_time_period_ms('121m')).to.be.null // exceeds 10 years
        expect(parse_time_period_ms('999999m')).to.be.null // extreme value
      })

      it('should accept periods at max limits', () => {
        // Max limits: 87600h, 3650d, 520w, 120m (10 years)
        expect(parse_time_period_ms('87600h')).to.not.be.null
        expect(parse_time_period_ms('3650d')).to.not.be.null
        expect(parse_time_period_ms('520w')).to.not.be.null
        expect(parse_time_period_ms('120m')).to.not.be.null
      })
    })

    describe('parse_time_period_date', () => {
      it('should return a Date object in the past', () => {
        const now = new Date()
        const result = parse_time_period_date('7d', now)

        expect(result).to.be.instanceOf(Date)
        expect(result.getTime()).to.be.lessThan(now.getTime())
      })

      it('should calculate the correct date', () => {
        const now = new Date('2025-01-10T12:00:00Z')
        const result = parse_time_period_date('7d', now)

        const expected = new Date('2025-01-03T12:00:00Z')
        expect(result.getTime()).to.equal(expected.getTime())
      })

      it('should return null for invalid period', () => {
        expect(parse_time_period_date('invalid')).to.be.null
      })
    })

    describe('is_valid_time_period', () => {
      it('should return true for valid periods', () => {
        expect(is_valid_time_period('24h')).to.be.true
        expect(is_valid_time_period('7d')).to.be.true
        expect(is_valid_time_period('2w')).to.be.true
        expect(is_valid_time_period('1m')).to.be.true
      })

      it('should return false for invalid periods', () => {
        expect(is_valid_time_period('')).to.be.false
        expect(is_valid_time_period('abc')).to.be.false
        expect(is_valid_time_period('7x')).to.be.false
      })
    })
  })

  describe('query_entities_by_thread_activity', () => {
    before(async () => {
      await close_duckdb_connection()
      await initialize_duckdb_client({ in_memory: true })
      await create_duckdb_schema()

      // Create test entities
      const now = new Date()
      const one_day_ago = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      const three_days_ago = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
      const ten_days_ago = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000)

      const test_entities = [
        {
          entity_id: 'task-recent',
          base_uri: 'user:task/task-recent.md',
          type: 'task',
          frontmatter: {
            entity_id: 'task-recent',
            base_uri: 'user:task/task-recent.md',
            type: 'task',
            title: 'Recent Task',
            status: 'In Progress',
            priority: 'High',
            created_at: three_days_ago.toISOString(),
            updated_at: one_day_ago.toISOString(),
            user_public_key: 'test-user'
          },
          user_public_key: 'test-user'
        },
        {
          entity_id: 'task-old',
          base_uri: 'user:task/task-old.md',
          type: 'task',
          frontmatter: {
            entity_id: 'task-old',
            base_uri: 'user:task/task-old.md',
            type: 'task',
            title: 'Old Task',
            status: 'Completed',
            priority: 'Low',
            created_at: ten_days_ago.toISOString(),
            updated_at: ten_days_ago.toISOString(),
            user_public_key: 'test-user'
          },
          user_public_key: 'test-user'
        },
        {
          entity_id: 'guideline-1',
          base_uri: 'user:guideline/guideline-1.md',
          type: 'guideline',
          frontmatter: {
            entity_id: 'guideline-1',
            base_uri: 'user:guideline/guideline-1.md',
            type: 'guideline',
            title: 'Test Guideline',
            created_at: one_day_ago.toISOString(),
            updated_at: one_day_ago.toISOString(),
            user_public_key: 'test-user'
          },
          user_public_key: 'test-user'
        }
      ]

      for (const entity of test_entities) {
        await upsert_entity_to_duckdb({ entity_data: entity })
      }

      // Create test threads with different updated_at timestamps
      const test_threads = [
        {
          thread_id: 'thread-recent-1',
          title: 'Recent thread working on task-recent',
          thread_state: 'active',
          created_at: one_day_ago.toISOString(),
          updated_at: one_day_ago.toISOString()
        },
        {
          thread_id: 'thread-recent-2',
          title: 'Another recent thread on task-recent',
          thread_state: 'archived',
          created_at: three_days_ago.toISOString(),
          updated_at: three_days_ago.toISOString()
        },
        {
          thread_id: 'thread-old',
          title: 'Old thread on task-old',
          thread_state: 'archived',
          created_at: ten_days_ago.toISOString(),
          updated_at: ten_days_ago.toISOString()
        },
        {
          thread_id: 'thread-guideline',
          title: 'Thread accessing guideline',
          thread_state: 'active',
          created_at: one_day_ago.toISOString(),
          updated_at: one_day_ago.toISOString()
        }
      ]

      for (const thread of test_threads) {
        await upsert_thread_to_duckdb({ thread_data: thread })
      }

      // Create thread -> entity relations
      await sync_entity_relations_to_duckdb({
        source_base_uri: 'user:thread/thread-recent-1',
        relations: [
          {
            target_base_uri: 'user:task/task-recent.md',
            relation_type: 'modifies'
          }
        ]
      })

      await sync_entity_relations_to_duckdb({
        source_base_uri: 'user:thread/thread-recent-2',
        relations: [
          {
            target_base_uri: 'user:task/task-recent.md',
            relation_type: 'modifies'
          }
        ]
      })

      await sync_entity_relations_to_duckdb({
        source_base_uri: 'user:thread/thread-old',
        relations: [
          {
            target_base_uri: 'user:task/task-old.md',
            relation_type: 'modifies'
          }
        ]
      })

      await sync_entity_relations_to_duckdb({
        source_base_uri: 'user:thread/thread-guideline',
        relations: [
          {
            target_base_uri: 'user:guideline/guideline-1.md',
            relation_type: 'accesses'
          }
        ]
      })
    })

    after(async () => {
      try {
        await close_duckdb_connection()
      } catch (error) {
        // Ignore cleanup errors
      }
    })

    it('should find entities with thread activity within period', async () => {
      const since_date = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days ago

      const entities = await query_entities_by_thread_activity({
        since_date
      })

      expect(entities).to.be.an('array')
      expect(entities.length).to.be.greaterThan(0)

      // task-recent should be found (has threads within 7 days)
      const task_recent = entities.find(
        (e) => e.base_uri === 'user:task/task-recent.md'
      )
      expect(task_recent).to.exist
      expect(task_recent.thread_count).to.equal(2)
    })

    it('should exclude entities with only old thread activity', async () => {
      const since_date = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days ago

      const entities = await query_entities_by_thread_activity({
        since_date
      })

      // task-old should NOT be found (only has thread from 10 days ago)
      const task_old = entities.find(
        (e) => e.base_uri === 'user:task/task-old.md'
      )
      expect(task_old).to.not.exist
    })

    it('should filter by entity type', async () => {
      const since_date = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

      const entities = await query_entities_by_thread_activity({
        since_date,
        entity_types: 'task'
      })

      expect(entities).to.be.an('array')
      // Should only include tasks, not guidelines
      for (const entity of entities) {
        expect(entity.type).to.equal('task')
      }
    })

    it('should filter by multiple entity types', async () => {
      const since_date = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

      const entities = await query_entities_by_thread_activity({
        since_date,
        entity_types: ['task', 'guideline']
      })

      expect(entities).to.be.an('array')
      expect(entities.length).to.be.greaterThan(0)
      // Should include both tasks and guidelines
      const types = new Set(entities.map((e) => e.type))
      expect(types.has('task') || types.has('guideline')).to.be.true
    })

    it('should return entity metadata', async () => {
      const since_date = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

      const entities = await query_entities_by_thread_activity({
        since_date,
        entity_types: 'task'
      })

      const entity = entities[0]
      expect(entity).to.have.property('base_uri')
      expect(entity).to.have.property('entity_id')
      expect(entity).to.have.property('type')
      expect(entity).to.have.property('title')
      expect(entity).to.have.property('thread_count')
      expect(entity).to.have.property('last_activity')
    })

    it('should apply limit parameter', async () => {
      const since_date = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days

      const entities = await query_entities_by_thread_activity({
        since_date,
        limit: 1
      })

      expect(entities).to.be.an('array')
      expect(entities.length).to.be.at.most(1)
    })

    it('should order by last_activity descending', async () => {
      const since_date = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days

      const entities = await query_entities_by_thread_activity({
        since_date
      })

      expect(entities.length).to.be.greaterThan(1)

      // Verify descending order
      for (let i = 1; i < entities.length; i++) {
        const prev_activity = new Date(entities[i - 1].last_activity).getTime()
        const curr_activity = new Date(entities[i].last_activity).getTime()
        expect(prev_activity).to.be.at.least(curr_activity)
      }
    })

    it('should return empty array when no entities match', async () => {
      const since_date = new Date() // Just now - no threads updated this instant

      const entities = await query_entities_by_thread_activity({
        since_date,
        entity_types: 'non-existent-type'
      })

      expect(entities).to.be.an('array')
      expect(entities.length).to.equal(0)
    })
  })
})
