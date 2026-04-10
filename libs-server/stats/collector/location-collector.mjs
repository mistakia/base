/**
 * Location Metrics Collector
 *
 * Aggregates daily location data from the `locations` table into
 * stats metrics. All metrics pass the time-series rubric in
 * guideline/stats-metric-categorization.md -- they are trend-dependent
 * and cannot be reconstructed from the current state of entities.
 */

import debug from 'debug'

import { ensure_locations_table } from '../locations-table.mjs'

const log = debug('stats:collector:location')

const EARTH_RADIUS_KM = 6371
const TRACKING_GAP_MS = 30 * 60 * 1000

function haversine_km(a, b) {
  const to_rad = (d) => (d * Math.PI) / 180
  const d_lat = to_rad(b.latitude - a.latitude)
  const d_lng = to_rad(b.longitude - a.longitude)
  const lat_a = to_rad(a.latitude)
  const lat_b = to_rad(b.latitude)
  const h =
    Math.sin(d_lat / 2) ** 2 +
    Math.cos(lat_a) * Math.cos(lat_b) * Math.sin(d_lng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

export async function collect_location_metrics({ snapshot_date, pool }) {
  const metrics = []

  if (!pool) {
    log('no pool; skipping')
    return metrics
  }

  await ensure_locations_table({ pool })

  const day_start = `${snapshot_date} 00:00:00`
  const day_end = `${snapshot_date} 23:59:59.999`

  // Daily point count by source
  const count_rows = await pool.query(
    `
    SELECT source, COUNT(*) AS cnt
    FROM locations
    WHERE recorded_at >= $1 AND recorded_at <= $2
    GROUP BY source
    `,
    [day_start, day_end]
  )

  let total_points = 0
  for (const row of count_rows.rows) {
    const count = Number(row.cnt)
    total_points += count
    metrics.push({
      snapshot_date,
      category: 'location',
      metric_name: 'location_report_count',
      metric_value: count,
      unit: 'count',
      dimensions: { source: row.source || 'unknown' }
    })
  }

  metrics.push({
    snapshot_date,
    category: 'location',
    metric_name: 'location_report_count',
    metric_value: total_points,
    unit: 'count',
    dimensions: {}
  })

  // Geofence events: count enters/exits per location region
  const geofence_rows = await pool.query(
    `
    SELECT
      metadata->>'geofence_region_id' AS region_id,
      metadata->>'geofence_event' AS event_type,
      COUNT(*) AS cnt
    FROM locations
    WHERE recorded_at >= $1 AND recorded_at <= $2
      AND metadata->>'geofence_event' IS NOT NULL
    GROUP BY region_id, event_type
    `,
    [day_start, day_end]
  )

  for (const row of geofence_rows.rows) {
    metrics.push({
      snapshot_date,
      category: 'location',
      metric_name: 'geofence_events',
      metric_value: Number(row.cnt),
      unit: 'count',
      dimensions: {
        location: row.region_id || 'unknown',
        event_type: row.event_type || 'unknown'
      }
    })
  }

  // Ordered points for distance + tracking hours computation
  const point_rows = await pool.query(
    `
    SELECT latitude, longitude, recorded_at
    FROM locations
    WHERE recorded_at >= $1 AND recorded_at <= $2
    ORDER BY recorded_at ASC
    `,
    [day_start, day_end]
  )

  let distance_km = 0
  let tracking_ms = 0
  const points = point_rows.rows
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]
    const curr = points[i]
    const gap = new Date(curr.recorded_at).getTime() - new Date(prev.recorded_at).getTime()
    if (gap > 0 && gap <= TRACKING_GAP_MS) {
      distance_km += haversine_km(
        { latitude: Number(prev.latitude), longitude: Number(prev.longitude) },
        { latitude: Number(curr.latitude), longitude: Number(curr.longitude) }
      )
      tracking_ms += gap
    }
  }

  metrics.push({
    snapshot_date,
    category: 'location',
    metric_name: 'distance_traveled_km',
    metric_value: Number(distance_km.toFixed(3)),
    unit: 'kilometers',
    dimensions: {}
  })

  metrics.push({
    snapshot_date,
    category: 'location',
    metric_name: 'location_tracking_hours',
    metric_value: Number((tracking_ms / 3600000).toFixed(3)),
    unit: 'hours',
    dimensions: {}
  })

  log('Collected %d location metrics', metrics.length)
  return metrics
}
