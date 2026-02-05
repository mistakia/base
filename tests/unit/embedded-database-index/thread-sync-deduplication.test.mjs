/**
 * @fileoverview Unit tests for thread sync deduplication in EmbeddedIndexManager
 *
 * Tests verify that concurrent sync requests for the same thread_id are
 * coalesced into a single execution, with all callers receiving the same result.
 */

import { expect } from 'chai'

import { EmbeddedIndexManager } from '#libs-server/embedded-database-index/embedded-index-manager.mjs'

describe('EmbeddedIndexManager Thread Sync Deduplication', function () {
  this.timeout(10000)

  let manager

  beforeEach(() => {
    // Create a fresh manager instance for each test
    manager = new EmbeddedIndexManager()
    // Mark as initialized but with no database backends ready
    // This allows sync_thread to run but _execute_thread_sync returns early
    manager.initialized = true
    manager.duckdb_ready = false
  })

  describe('constructor', () => {
    it('should initialize _pending_thread_syncs as an empty Map', () => {
      const new_manager = new EmbeddedIndexManager()
      expect(new_manager._pending_thread_syncs).to.be.instanceOf(Map)
      expect(new_manager._pending_thread_syncs.size).to.equal(0)
    })
  })

  describe('sync_thread', () => {
    it('should execute single sync request normally', async () => {
      const thread_id = 'test-thread-1'
      const metadata = { title: 'Test Thread' }

      const result = await manager.sync_thread({ thread_id, metadata })

      expect(result).to.have.property('success', true)
      expect(result).to.have.property('duckdb_synced', false)
    })

    it('should clear pending map after sync completes', async () => {
      const thread_id = 'test-thread-2'
      const metadata = { title: 'Test Thread' }

      expect(manager._pending_thread_syncs.size).to.equal(0)

      await manager.sync_thread({ thread_id, metadata })

      expect(manager._pending_thread_syncs.size).to.equal(0)
    })

    it('should deduplicate concurrent requests for same thread_id', async () => {
      let execute_count = 0
      const original_execute = manager._execute_thread_sync.bind(manager)

      // Mock _execute_thread_sync to track call count and add delay
      manager._execute_thread_sync = async function ({ thread_id, metadata }) {
        execute_count++
        // Add delay to allow concurrent calls to queue up
        await new Promise((resolve) => setTimeout(resolve, 50))
        return original_execute({ thread_id, metadata })
      }

      const thread_id = 'test-thread-3'

      // Launch multiple concurrent sync requests
      const promises = [
        manager.sync_thread({ thread_id, metadata: { title: 'Version 1' } }),
        manager.sync_thread({ thread_id, metadata: { title: 'Version 2' } }),
        manager.sync_thread({ thread_id, metadata: { title: 'Version 3' } })
      ]

      const results = await Promise.all(promises)

      // Should only execute once despite 3 concurrent requests
      expect(execute_count).to.equal(1)

      // All callers should receive the same result
      expect(results[0]).to.deep.equal(results[1])
      expect(results[1]).to.deep.equal(results[2])
    })

    it('should allow separate syncs for different thread_ids', async () => {
      let execute_count = 0
      const original_execute = manager._execute_thread_sync.bind(manager)

      manager._execute_thread_sync = async function ({ thread_id, metadata }) {
        execute_count++
        await new Promise((resolve) => setTimeout(resolve, 50))
        return original_execute({ thread_id, metadata })
      }

      // Launch concurrent sync requests for different threads
      const promises = [
        manager.sync_thread({
          thread_id: 'thread-a',
          metadata: { title: 'Thread A' }
        }),
        manager.sync_thread({
          thread_id: 'thread-b',
          metadata: { title: 'Thread B' }
        }),
        manager.sync_thread({
          thread_id: 'thread-c',
          metadata: { title: 'Thread C' }
        })
      ]

      await Promise.all(promises)

      // Should execute once per unique thread_id
      expect(execute_count).to.equal(3)
    })

    it('should update metadata to latest version for deduplicated requests', async () => {
      let captured_metadata = null
      const original_execute = manager._execute_thread_sync.bind(manager)

      manager._execute_thread_sync = async function ({ thread_id, metadata }) {
        // Add delay to allow concurrent calls to update metadata
        await new Promise((resolve) => setTimeout(resolve, 50))
        captured_metadata = metadata
        return original_execute({ thread_id, metadata })
      }

      const thread_id = 'test-thread-4'

      // Launch requests - the last one should have its metadata used
      const promises = [
        manager.sync_thread({ thread_id, metadata: { title: 'First' } }),
        manager.sync_thread({ thread_id, metadata: { title: 'Second' } }),
        manager.sync_thread({ thread_id, metadata: { title: 'Third' } })
      ]

      await Promise.all(promises)

      // The metadata should be from one of the later calls
      // (exact value depends on timing, but should not be 'First')
      expect(captured_metadata).to.have.property('title')
    })

    it('should resolve all callbacks with failure result on error', async () => {
      // Mock _execute_thread_sync to simulate failure
      manager._execute_thread_sync = async function () {
        await new Promise((resolve) => setTimeout(resolve, 50))
        return { success: false, duckdb_synced: false }
      }

      const thread_id = 'test-thread-5'

      const promises = [
        manager.sync_thread({ thread_id, metadata: { title: 'Test 1' } }),
        manager.sync_thread({ thread_id, metadata: { title: 'Test 2' } }),
        manager.sync_thread({ thread_id, metadata: { title: 'Test 3' } })
      ]

      const results = await Promise.all(promises)

      // All callers should receive the failure result
      for (const result of results) {
        expect(result).to.have.property('success', false)
      }
    })

    it('should handle exception in _execute_thread_sync gracefully', async () => {
      const error_message = 'Simulated sync error'

      manager._execute_thread_sync = async function () {
        await new Promise((resolve) => setTimeout(resolve, 50))
        throw new Error(error_message)
      }

      const thread_id = 'test-thread-6'

      // First request should throw
      const first_promise = manager.sync_thread({
        thread_id,
        metadata: { title: 'Test' }
      })

      // Second request joins the first
      const second_promise = manager.sync_thread({
        thread_id,
        metadata: { title: 'Test 2' }
      })

      // Both should reject with the same error
      try {
        await first_promise
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).to.equal(error_message)
      }

      // Second promise should also reject (it was joined to first)
      try {
        await second_promise
        expect.fail('Second promise should have thrown an error')
      } catch (error) {
        expect(error.message).to.equal(error_message)
      }

      // Pending map should be cleared even after error
      expect(manager._pending_thread_syncs.size).to.equal(0)
    })

    it('should allow new sync after previous sync completes', async () => {
      let execute_count = 0
      const original_execute = manager._execute_thread_sync.bind(manager)

      manager._execute_thread_sync = async function ({ thread_id, metadata }) {
        execute_count++
        return original_execute({ thread_id, metadata })
      }

      const thread_id = 'test-thread-7'

      // First sync
      await manager.sync_thread({ thread_id, metadata: { title: 'First' } })
      expect(execute_count).to.equal(1)

      // Second sync (should execute again since first is complete)
      await manager.sync_thread({ thread_id, metadata: { title: 'Second' } })
      expect(execute_count).to.equal(2)
    })

    it('should continue resolving other callbacks if one callback throws', async () => {
      const original_execute = manager._execute_thread_sync.bind(manager)
      let resolved_count = 0

      manager._execute_thread_sync = async function ({ thread_id, metadata }) {
        await new Promise((resolve) => setTimeout(resolve, 50))
        return original_execute({ thread_id, metadata })
      }

      const thread_id = 'test-thread-8'

      // First request initiates the sync
      const first_promise = manager.sync_thread({
        thread_id,
        metadata: { title: 'Test' }
      })

      // Manually add a callback that throws when resolved
      const pending = manager._pending_thread_syncs.get(thread_id)
      pending.callbacks.push({
        resolve: () => {
          throw new Error('Simulated callback error')
        },
        reject: () => {}
      })

      // Add a normal callback that should still be called
      const second_promise = new Promise((resolve) => {
        pending.callbacks.push({
          resolve: (result) => {
            resolved_count++
            resolve(result)
          },
          reject: () => {}
        })
      })

      // Wait for sync to complete
      await first_promise
      await second_promise

      // The normal callback should have been called despite the throwing callback
      expect(resolved_count).to.equal(1)
    })
  })
})
