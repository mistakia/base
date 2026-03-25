/**
 * Stats Database
 *
 * PostgreSQL connection pool and query functions for the stats metrics table.
 */

import debug from 'debug'

const log = debug('stats:database')

let pg_module = null

async function get_pg() {
  if (!pg_module) {
    pg_module = await import('pg')
  }
  return pg_module
}

let pool_instance = null

/**
 * Get a shared pg Pool for the stats database.
 *
 * Returns a Pool connected to the stats_production database.
 * The Pool is also used by subtask routes (e.g., location.mjs)
 * for raw INSERT queries -- not wrapped in metrics-specific logic.
 */
export async function get_stats_database_connection({ config }) {
  if (pool_instance) {
    return pool_instance
  }

  const connection_string = config.stats_database?.connection_string
  if (!connection_string) {
    throw new Error('stats_database.connection_string not configured')
  }

  const pg = await get_pg()
  const Pool = pg.default?.Pool || pg.Pool

  pool_instance = new Pool({ connectionString: connection_string })
  log('Created stats database pool')

  return pool_instance
}

/**
 * Bulk upsert metric rows. Uses ON CONFLICT to make snapshots idempotent.
 */
export async function upsert_metrics({ pool, metrics }) {
  if (!metrics || metrics.length === 0) {
    return { upserted: 0 }
  }

  const values = []
  const placeholders = []
  let idx = 1

  for (const m of metrics) {
    placeholders.push(
      `($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`
    )
    values.push(
      m.snapshot_date,
      m.category,
      m.metric_name,
      m.metric_value,
      m.unit || null,
      JSON.stringify(m.dimensions || {})
    )
  }

  const sql = `
    INSERT INTO metrics (snapshot_date, category, metric_name, metric_value, unit, dimensions)
    VALUES ${placeholders.join(', ')}
    ON CONFLICT (snapshot_date, category, metric_name, dimensions)
    DO UPDATE SET metric_value = EXCLUDED.metric_value
  `

  const result = await pool.query(sql, values)
  log('Upserted %d metrics', metrics.length)
  return { upserted: result.rowCount }
}

/**
 * Return all metrics for the most recent snapshot_date.
 */
export async function query_latest_snapshot({ pool }) {
  const result = await pool.query(`
    SELECT snapshot_date, category, metric_name, metric_value, unit, dimensions
    FROM metrics
    WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM metrics)
    ORDER BY category, metric_name
  `)
  return result.rows
}

/**
 * Return time series for a single metric, optionally filtered by dimensions.
 */
export async function query_metric_series({
  pool,
  metric_name,
  from_date,
  to_date,
  dimensions
}) {
  const params = [metric_name]
  let where = 'WHERE metric_name = $1'

  if (from_date) {
    params.push(from_date)
    where += ` AND snapshot_date >= $${params.length}`
  }
  if (to_date) {
    params.push(to_date)
    where += ` AND snapshot_date <= $${params.length}`
  }
  if (dimensions) {
    params.push(JSON.stringify(dimensions))
    where += ` AND dimensions @> $${params.length}::jsonb`
  }

  const result = await pool.query(
    `SELECT snapshot_date, metric_value, unit, dimensions
     FROM metrics ${where}
     ORDER BY snapshot_date`,
    params
  )
  return result.rows
}

/**
 * Return distinct snapshot dates ordered descending, with metric counts.
 */
export async function list_snapshot_dates({ pool, limit = 365 }) {
  const result = await pool.query(
    `SELECT snapshot_date, COUNT(*) as metric_count
     FROM metrics
     GROUP BY snapshot_date
     ORDER BY snapshot_date DESC
     LIMIT $1`,
    [limit]
  )
  return result.rows
}

/**
 * Close the shared pool. Call on process exit.
 */
export async function close_stats_pool() {
  if (pool_instance) {
    await pool_instance.end()
    pool_instance = null
    log('Stats database pool closed')
  }
}
