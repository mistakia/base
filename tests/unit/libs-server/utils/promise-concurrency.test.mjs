/* global describe, it */

import { expect } from 'chai'

import { map_with_concurrency } from '#libs-server/utils/promise-concurrency.mjs'

describe('promise-concurrency', () => {
  describe('map_with_concurrency', () => {
    it('should return results in original order', async () => {
      const items = [3, 1, 2]
      const results = await map_with_concurrency(
        items,
        async (item) => item * 10,
        2
      )

      expect(results).to.deep.equal([30, 10, 20])
    })

    it('should handle empty array', async () => {
      const results = await map_with_concurrency([], async (item) => item, 5)

      expect(results).to.deep.equal([])
    })

    it('should limit concurrency', async () => {
      let active_count = 0
      let max_active = 0
      const limit = 2

      const items = [1, 2, 3, 4, 5]
      await map_with_concurrency(
        items,
        async (item) => {
          active_count++
          if (active_count > max_active) max_active = active_count
          // Simulate async work
          await new Promise((resolve) => setTimeout(resolve, 10))
          active_count--
          return item
        },
        limit
      )

      expect(max_active).to.be.at.most(limit)
    })

    it('should pass index to callback', async () => {
      const items = ['a', 'b', 'c']
      const results = await map_with_concurrency(
        items,
        async (_item, index) => index,
        2
      )

      expect(results).to.deep.equal([0, 1, 2])
    })

    it('should propagate errors', async () => {
      const items = [1, 2, 3]

      try {
        await map_with_concurrency(
          items,
          async (item) => {
            if (item === 2) throw new Error('test error')
            return item
          },
          2
        )
        expect.fail('should have thrown')
      } catch (error) {
        expect(error.message).to.equal('test error')
      }
    })

    it('should work when limit exceeds item count', async () => {
      const items = [1, 2]
      const results = await map_with_concurrency(
        items,
        async (item) => item * 2,
        10
      )

      expect(results).to.deep.equal([2, 4])
    })

    it('should work with limit of 1 (sequential)', async () => {
      const execution_order = []
      const items = [1, 2, 3]

      await map_with_concurrency(
        items,
        async (item) => {
          execution_order.push(item)
          await new Promise((resolve) => setTimeout(resolve, 5))
          return item
        },
        1
      )

      expect(execution_order).to.deep.equal([1, 2, 3])
    })
  })
})
