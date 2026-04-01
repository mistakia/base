/**
 * @fileoverview Unit tests for embedded-index-manager fallback behavior.
 *
 * Verifies that query methods fall back to filesystem when the backend
 * is unavailable, and that index-only methods throw appropriately.
 */

import { expect } from 'chai'
import { EmbeddedIndexManager } from '#libs-server/embedded-database-index/embedded-index-manager.mjs'

describe('Embedded Index Manager Fallback', function () {
  this.timeout(10000)

  describe('when backend is not ready', () => {
    let manager

    beforeEach(() => {
      manager = new EmbeddedIndexManager()
      // Manager is not initialized, so is_ready() returns false
    })

    describe('query methods with fallback', () => {
      it('should fall back to filesystem for query_threads', async () => {
        // Override fallbacks with a test implementation
        manager._fallbacks = {
          query_threads: async () => [{ thread_id: 'fallback-thread' }]
        }

        const result = await manager.query_threads({})
        expect(result).to.be.an('array')
        expect(result[0].thread_id).to.equal('fallback-thread')
      })

      it('should fall back to filesystem for count_threads', async () => {
        manager._fallbacks = {
          count_threads: async () => 5
        }

        const result = await manager.count_threads({})
        expect(result).to.equal(5)
      })

      it('should fall back to filesystem for query_tasks', async () => {
        manager._fallbacks = {
          query_tasks: async () => [{ base_uri: 'user:task/fallback.md' }]
        }

        const result = await manager.query_tasks({})
        expect(result).to.be.an('array')
        expect(result[0].base_uri).to.equal('user:task/fallback.md')
      })

      it('should fall back to filesystem for query_physical_items', async () => {
        manager._fallbacks = {
          query_physical_items: async () => []
        }

        const result = await manager.query_physical_items({})
        expect(result).to.deep.equal([])
      })
    })

    describe('query methods without fallback (index-only)', () => {
      it('should throw for query_entities when index unavailable', async () => {
        try {
          await manager.query_entities({})
          expect.fail('Should have thrown')
        } catch (error) {
          expect(error.message).to.include('Index not available')
        }
      })

      it('should throw for get_entity_by_uri when index unavailable', async () => {
        try {
          await manager.get_entity_by_uri({ base_uri: 'user:task/test.md' })
          expect.fail('Should have thrown')
        } catch (error) {
          expect(error.message).to.include('Index not available')
        }
      })

      it('should throw for find_related_entities when index unavailable', async () => {
        try {
          await manager.find_related_entities({ base_uri: 'user:task/test.md' })
          expect.fail('Should have thrown')
        } catch (error) {
          expect(error.message).to.include('Index not available')
        }
      })

      it('should throw for query_tag_statistics when index unavailable', async () => {
        try {
          await manager.query_tag_statistics({})
          expect.fail('Should have thrown')
        } catch (error) {
          expect(error.message).to.include('Index not available')
        }
      })

      it('should throw for query_entities_by_thread_activity when index unavailable', async () => {
        try {
          await manager.query_entities_by_thread_activity({})
          expect.fail('Should have thrown')
        } catch (error) {
          expect(error.message).to.include('Index not available')
        }
      })
    })

    describe('methods without registered fallbacks', () => {
      it('should throw when no fallback is registered for the method', async () => {
        manager._fallbacks = {} // Empty fallbacks

        try {
          await manager.query_threads({})
          expect.fail('Should have thrown')
        } catch (error) {
          expect(error.message).to.include('no fallback registered')
        }
      })
    })
  })

  describe('when backend is ready but fails', () => {
    let manager

    beforeEach(() => {
      manager = new EmbeddedIndexManager()
      // Simulate initialized + ready state
      manager.initialized = true
      manager.sqlite_ready = true
    })

    it('should fall back when backend method throws', async () => {
      manager._backend = {
        query_threads: async () => {
          throw new Error('SQLite connection lost')
        }
      }
      manager._fallbacks = {
        query_threads: async () => [{ thread_id: 'recovered-thread' }]
      }

      const result = await manager.query_threads({})
      expect(result).to.be.an('array')
      expect(result[0].thread_id).to.equal('recovered-thread')
    })

    it('should rethrow when backend fails and no fallback exists', async () => {
      manager._backend = {
        query_entities: async () => {
          throw new Error('SQLite error')
        }
      }

      try {
        await manager.query_entities({})
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error.message).to.equal('SQLite error')
      }
    })

    it('should pass params to both backend and fallback', async () => {
      let backend_params = null
      let fallback_params = null

      manager._backend = {
        query_threads: async (params) => {
          backend_params = params
          throw new Error('Backend failed')
        }
      }
      manager._fallbacks = {
        query_threads: async (params) => {
          fallback_params = params
          return []
        }
      }

      const params = { filters: [{ column_id: 'thread_state', value: 'active' }] }
      await manager.query_threads(params)

      expect(backend_params).to.deep.equal(params)
      expect(fallback_params).to.deep.equal(params)
    })
  })

  describe('write methods (no fallback)', () => {
    let manager

    beforeEach(() => {
      manager = new EmbeddedIndexManager()
      // Not initialized - write methods should throw
    })

    it('should throw for upsert_embeddings when index unavailable', async () => {
      try {
        await manager.upsert_embeddings({})
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error.message).to.include('Index not available')
      }
    })

    it('should throw for truncate_heatmap_daily when index unavailable', async () => {
      try {
        await manager.truncate_heatmap_daily()
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error.message).to.include('Index not available')
      }
    })
  })
})
