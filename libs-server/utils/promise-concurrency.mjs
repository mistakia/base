/**
 * Concurrency-limited Promise utility.
 *
 * Replaces unbounded Promise.all(items.map(fn)) with parallel execution
 * limited to a configurable number of concurrent operations.
 */

/**
 * Map an array of items through an async function with limited concurrency.
 * Results are returned in the same order as the input array (same contract
 * as Promise.all(items.map(fn))).
 *
 * @param {Array} items - Array of items to process
 * @param {Function} fn - Async function to apply to each item: (item, index) => Promise<result>
 * @param {number} limit - Maximum number of concurrent operations
 * @returns {Promise<Array>} Results in original order
 */
export async function map_with_concurrency(items, fn, limit) {
  const results = new Array(items.length)
  let next_index = 0

  async function run_worker() {
    while (next_index < items.length) {
      const index = next_index++
      results[index] = await fn(items[index], index)
    }
  }

  const worker_count = Math.min(limit, items.length)
  const workers = []
  for (let i = 0; i < worker_count; i++) {
    workers.push(run_worker())
  }

  await Promise.all(workers)
  return results
}
