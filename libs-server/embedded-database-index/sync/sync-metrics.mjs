/**
 * Sync Metrics
 *
 * Lightweight in-process metrics collection for index-sync-service.
 * Periodically dumps counters and gauges to stderr so they appear
 * in PM2 log files (Bun runtime suppresses debug() output).
 *
 * Factory function returns a plain object -- no classes per write-javascript guideline.
 */

const DUMP_INTERVAL_MS = 300000 // 5 minutes
const HEARTBEAT_INTERVAL_MS = 60000 // 60 seconds
const FAILURE_WARN_DEDUPE_WINDOW_MS = 60000 // suppress repeat warns for same key
const FAILURE_WARN_DEDUPE_MAX_ENTRIES = 1024

/**
 * Create a sync metrics collector.
 *
 * @param {Object} params
 * @param {Function} params.get_sqlite_ready - Returns boolean indicating SQLite readiness
 * @param {Function} [params.get_cache_size] - Returns current timeline cache size
 * @returns {Object} Metrics collector with increment, timing, gauge, dump, start, stop
 */
export function create_sync_metrics({ get_sqlite_ready, get_cache_size }) {
  const start_time = Date.now()
  const counters = new Map()
  const timings = new Map()
  const gauges = new Map()
  let last_sync_at = null

  let dump_interval = null
  let heartbeat_interval = null

  function increment(name, delta = 1) {
    if (delta === 0) return
    counters.set(name, (counters.get(name) || 0) + delta)
  }

  function timing(name, duration_ms) {
    const existing = timings.get(name)
    if (existing) {
      existing.sum += duration_ms
      existing.count += 1
      existing.latest = duration_ms
    } else {
      timings.set(name, { sum: duration_ms, count: 1, latest: duration_ms })
    }
  }

  function gauge(name, value) {
    gauges.set(name, value)
  }

  function record_sync() {
    last_sync_at = Date.now()
  }

  // Dedupe [watcher-failure] warns so a persistent bad file doesn't flood
  // PM2 logs on every chokidar event. Aggregate counters still increment.
  const warn_seen_at = new Map()

  function record_failure(counter_name, message, dedupe_key) {
    increment(counter_name)
    const key = dedupe_key || message
    const now = Date.now()
    const last = warn_seen_at.get(key)
    if (last !== undefined && now - last < FAILURE_WARN_DEDUPE_WINDOW_MS) {
      return
    }
    if (warn_seen_at.size >= FAILURE_WARN_DEDUPE_MAX_ENTRIES) {
      // Drop the oldest half to bound memory under truly diverse failure streams
      const keep_after = now - FAILURE_WARN_DEDUPE_WINDOW_MS
      for (const [k, ts] of warn_seen_at) {
        if (ts < keep_after) warn_seen_at.delete(k)
      }
    }
    warn_seen_at.set(key, now)
    console.warn('[watcher-failure] %s', message)
  }

  function dump() {
    const c = (name) => counters.get(name) || 0
    const g = (name) => gauges.get(name) || 0
    const avg = (name) => {
      const t = timings.get(name)
      return t && t.count > 0 ? Math.round(t.sum / t.count) : 0
    }

    const uptime_s = Math.round((Date.now() - start_time) / 1000)

    const line = `[metrics] entity_syncs=${c('entity_syncs')} entity_deletes=${c('entity_deletes')} thread_syncs=${c('thread_syncs')} thread_deletes=${c('thread_deletes')} reconciliations=${c('reconciliations')} reconcile_missing=${c('reconcile_missing')} reconcile_drift=${c('reconcile_drift')} reconcile_orphans=${c('reconcile_orphans')} reconcile_errors=${c('reconcile_errors')} parse_unexpected_failures=${c('parse_unexpected_failures')} errors=${c('sync_errors')} avg_entity_sync_ms=${avg('entity_sync')} avg_thread_sync_ms=${avg('thread_sync')} avg_reconciliation_ms=${avg('reconciliation')} cache_hits=${c('cache_hits')} cache_misses=${c('cache_misses')} cache_size=${g('cache_size')} watcher_events=${c('watcher_events_total')} fsevents_errors=${c('fsevents_errors')} watcher_entity_read_failed=${c('watcher_entity_read_failed')} watcher_entity_sync_failed=${c('watcher_entity_sync_failed')} watcher_entity_delete_failed=${c('watcher_entity_delete_failed')} watcher_thread_sync_failed=${c('watcher_thread_sync_failed')} watcher_thread_delete_failed=${c('watcher_thread_delete_failed')} reconciliation_files=${g('reconciliation_files')} ipc_syncs=${c('ipc_syncs_processed')} ipc_deletes=${c('ipc_deletes_processed')} ipc_timeouts=${c('ipc_timeouts')} queue_depth=${g('ipc_queue_depth')} overflow_events=${c('ipc_overflow_events')} uptime_s=${uptime_s}`

    console.error(line)

    // Reset counters and timings after dump (gauges persist)
    counters.clear()
    timings.clear()
  }

  function emit_heartbeat() {
    const uptime_s = Math.round((Date.now() - start_time) / 1000)
    const sqlite_ready = get_sqlite_ready()
    const cache_size = get_cache_size ? get_cache_size() : 0
    const last_sync_age_s =
      last_sync_at !== null
        ? Math.round((Date.now() - last_sync_at) / 1000)
        : -1

    const line = `[heartbeat] pid=${process.pid} uptime_s=${uptime_s} sqlite_ready=${sqlite_ready} last_sync_age_s=${last_sync_age_s} cache_size=${cache_size}`
    console.error(line)
  }

  function start() {
    dump_interval = setInterval(dump, DUMP_INTERVAL_MS)
    heartbeat_interval = setInterval(emit_heartbeat, HEARTBEAT_INTERVAL_MS)

    // Unref so intervals don't prevent process exit
    if (dump_interval.unref) dump_interval.unref()
    if (heartbeat_interval.unref) heartbeat_interval.unref()
  }

  function stop() {
    if (dump_interval) {
      clearInterval(dump_interval)
      dump_interval = null
    }
    if (heartbeat_interval) {
      clearInterval(heartbeat_interval)
      heartbeat_interval = null
    }
  }

  return {
    increment,
    timing,
    gauge,
    record_sync,
    record_failure,
    dump,
    start,
    stop
  }
}
