/* global describe, it, before */

import { expect } from 'chai'

/**
 * Tests for cache-warmer service module exports and basic functionality.
 *
 * Note: Full integration tests requiring a running server and DuckDB
 * should be placed in tests/integration/services/
 */

describe('cache-warmer', () => {
  let cache_warmer_module

  before(async () => {
    cache_warmer_module = await import('#server/services/cache-warmer.mjs')
  })

  describe('module exports', () => {
    it('should export cache object', () => {
      expect(cache_warmer_module.cache).to.be.an('object')
      expect(cache_warmer_module.cache).to.have.property('activity_heatmap')
      expect(cache_warmer_module.cache).to.have.property('tasks')
    })

    it('should export CACHE_TTL object', () => {
      expect(cache_warmer_module.CACHE_TTL).to.be.an('object')
      expect(cache_warmer_module.CACHE_TTL).to.have.property('activity')
      expect(cache_warmer_module.CACHE_TTL).to.have.property('tasks')
    })

    it('should export invalidate_activity_cache function', () => {
      expect(cache_warmer_module.invalidate_activity_cache).to.be.a('function')
    })

    it('should export invalidate_tasks_cache function', () => {
      expect(cache_warmer_module.invalidate_tasks_cache).to.be.a('function')
    })

    it('should export get_cached_activity_heatmap function', () => {
      expect(cache_warmer_module.get_cached_activity_heatmap).to.be.a(
        'function'
      )
    })

    it('should export get_cached_tasks function', () => {
      expect(cache_warmer_module.get_cached_tasks).to.be.a('function')
    })

    it('should export start_cache_warmer function', () => {
      expect(cache_warmer_module.start_cache_warmer).to.be.a('function')
    })

    it('should export stop_cache_warmer function', () => {
      expect(cache_warmer_module.stop_cache_warmer).to.be.a('function')
    })
  })

  describe('cache structure', () => {
    it('activity_heatmap cache should have expected properties', () => {
      const activity_cache = cache_warmer_module.cache.activity_heatmap
      expect(activity_cache).to.have.property('data')
      expect(activity_cache).to.have.property('timestamp')
      expect(activity_cache).to.have.property('days')
    })

    it('tasks cache should have expected properties', () => {
      const tasks_cache = cache_warmer_module.cache.tasks
      expect(tasks_cache).to.have.property('data')
      expect(tasks_cache).to.have.property('timestamp')
    })
  })

  describe('get_cached_activity_heatmap', () => {
    it('should return null when cache is empty', () => {
      // Reset cache timestamp to simulate empty cache
      const original_timestamp = cache_warmer_module.cache.activity_heatmap.timestamp
      cache_warmer_module.cache.activity_heatmap.timestamp = 0

      const result = cache_warmer_module.get_cached_activity_heatmap({
        days: 365
      })

      expect(result).to.be.null

      // Restore
      cache_warmer_module.cache.activity_heatmap.timestamp = original_timestamp
    })

    it('should return null when days mismatch', () => {
      // Set cache with different days value
      const original = { ...cache_warmer_module.cache.activity_heatmap }
      cache_warmer_module.cache.activity_heatmap = {
        data: { test: true },
        timestamp: Date.now(),
        days: 30
      }

      const result = cache_warmer_module.get_cached_activity_heatmap({
        days: 365
      })

      expect(result).to.be.null

      // Restore
      cache_warmer_module.cache.activity_heatmap = original
    })
  })

  describe('get_cached_tasks', () => {
    it('should return null when cache is empty', () => {
      // Reset cache timestamp to simulate empty cache
      const original_timestamp = cache_warmer_module.cache.tasks.timestamp
      cache_warmer_module.cache.tasks.timestamp = 0

      const result = cache_warmer_module.get_cached_tasks()

      expect(result).to.be.null

      // Restore
      cache_warmer_module.cache.tasks.timestamp = original_timestamp
    })
  })

  describe('CACHE_TTL values', () => {
    it('activity TTL should be 4 hours', () => {
      const four_hours_ms = 4 * 60 * 60 * 1000
      expect(cache_warmer_module.CACHE_TTL.activity).to.equal(four_hours_ms)
    })

    it('tasks TTL should be 20 minutes', () => {
      const twenty_minutes_ms = 20 * 60 * 1000
      expect(cache_warmer_module.CACHE_TTL.tasks).to.equal(twenty_minutes_ms)
    })
  })
})
