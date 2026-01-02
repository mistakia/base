/**
 * @fileoverview Unit tests for embedded index manager
 */

import { expect } from 'chai'
import fs from 'fs'
import path from 'path'
import os from 'os'

import { EmbeddedIndexManager } from '#libs-server/embedded-database-index/embedded-index-manager.mjs'

describe('Embedded Index Manager', () => {
  let test_base_path
  let manager

  before(async () => {
    // Create temporary directory for test database
    test_base_path = path.join(os.tmpdir(), `index-manager-test-${Date.now()}`)
    fs.mkdirSync(test_base_path, { recursive: true })

    // Create a new instance for testing (not the singleton)
    manager = new EmbeddedIndexManager()

    // Override the config getter for testing
    manager._get_index_config = () => ({
      enabled: true,
      kuzu_directory: path.join(test_base_path, 'kuzu'),
      duckdb_path: path.join(test_base_path, 'duckdb.db'),
      rebuild_on_startup: false,
      file_watcher_enabled: false
    })
  })

  after(async () => {
    await manager.shutdown()

    // Cleanup test directory
    if (test_base_path && fs.existsSync(test_base_path)) {
      fs.rmSync(test_base_path, { recursive: true, force: true })
    }
  })

  describe('initialize', () => {
    it('should initialize both Kuzu and DuckDB databases', async () => {
      await manager.initialize()

      expect(manager.is_kuzu_ready()).to.equal(true)
      expect(manager.is_duckdb_ready()).to.equal(true)
    })

    it('should report overall ready state correctly', () => {
      expect(manager.is_ready()).to.equal(true)
    })
  })

  describe('sync_entity', () => {
    it('should sync an entity to the index', async () => {
      const test_entity = {
        entity_id: 'test-entity-1',
        type: 'task',
        title: 'Test Task',
        status: 'open',
        priority: 'Medium',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tags: ['user:tag/test.md', 'user:tag/unit-test.md'],
        relations: []
      }

      // Should not throw
      await manager.sync_entity({
        base_uri: 'user:task/test-task.md',
        entity_data: test_entity
      })
    })

    it('should handle sync with minimal entity data', async () => {
      const minimal_entity = {
        entity_id: 'test-entity-minimal',
        type: 'task'
      }

      // Should not throw
      await manager.sync_entity({
        base_uri: 'user:task/minimal-task.md',
        entity_data: minimal_entity
      })
    })
  })

  describe('sync_thread', () => {
    it('should sync a thread to the index', async () => {
      const test_metadata = {
        title: 'Test Thread',
        state: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        message_count: 5,
        total_tokens: 1000
      }

      // Should not throw
      await manager.sync_thread({
        thread_id: 'test-thread-1',
        metadata: test_metadata
      })
    })
  })

  describe('remove_entity', () => {
    it('should remove an entity from the index', async () => {
      const base_uri = 'user:task/to-remove.md'

      // First sync the entity
      const test_entity = {
        entity_id: 'entity-to-remove',
        type: 'task',
        title: 'Entity to Remove',
        status: 'open',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      await manager.sync_entity({
        base_uri,
        entity_data: test_entity
      })

      // Then remove it
      await manager.remove_entity({ base_uri })
    })
  })

  describe('remove_thread', () => {
    it('should remove a thread from the index', async () => {
      const thread_id = 'test-thread-to-remove'

      // First sync the thread
      const test_metadata = {
        title: 'Thread to Remove',
        state: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      await manager.sync_thread({
        thread_id,
        metadata: test_metadata
      })

      // Then remove it
      await manager.remove_thread({ thread_id })
    })
  })

  describe('get_index_status', () => {
    it('should return status object with database states', () => {
      const status = manager.get_index_status()

      expect(status).to.have.property('initialized')
      expect(status).to.have.property('kuzu_ready')
      expect(status).to.have.property('duckdb_ready')
      expect(status).to.have.property('config')
      expect(status.initialized).to.equal(true)
      expect(status.kuzu_ready).to.equal(true)
      expect(status.duckdb_ready).to.equal(true)
    })
  })

  describe('rebuild_full_index', () => {
    it('should rebuild both database schemas', async () => {
      // Should not throw
      await manager.rebuild_full_index()

      // Databases should still be ready after rebuild
      expect(manager.is_kuzu_ready()).to.equal(true)
      expect(manager.is_duckdb_ready()).to.equal(true)
    })
  })
})
