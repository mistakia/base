// Shared utilities used by entity and thread reconcile sweeps.

export const DRIFT_TOLERANCE_MS = 1000
export const SYNC_CONCURRENCY = 8

export async function run_with_concurrency({ items, limit, worker }) {
  let index = 0
  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (true) {
        const current = index++
        if (current >= items.length) return
        await worker(items[current])
      }
    }
  )
  await Promise.all(runners)
}
