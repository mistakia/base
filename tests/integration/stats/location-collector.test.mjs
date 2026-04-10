import { expect } from 'chai'
import config from '#config'
import {
  get_stats_database_connection,
  close_stats_pool
} from '#libs-server/stats/database.mjs'
import {
  ensure_locations_table,
  reset_locations_table_initialization
} from '#libs-server/stats/locations-table.mjs'
import { collect_location_metrics } from '#libs-server/stats/collector/location-collector.mjs'

const has_stats_db = Boolean(config.stats_database?.connection_string)

describe('Stats collector: location', function () {
  this.timeout(15000)

  const snapshot_date = '2026-04-09'
  const test_user_key = 'collector_test_user_key_0000000000000000000000000000000000000000'
  let pool

  before(async function () {
    if (!has_stats_db) {
      this.skip()
      return
    }
    pool = await get_stats_database_connection({ config })
    reset_locations_table_initialization()
    await ensure_locations_table({ pool })
    await pool.query(`DELETE FROM locations WHERE user_public_key = $1`, [
      test_user_key
    ])
  })

  after(async function () {
    if (!has_stats_db) return
    await pool.query(`DELETE FROM locations WHERE user_public_key = $1`, [
      test_user_key
    ])
    await close_stats_pool()
  })

  async function insert_record({ latitude, longitude, recorded_at, metadata = {} }) {
    await pool.query(
      `INSERT INTO locations
         (user_public_key, latitude, longitude, recorded_at, source, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        test_user_key,
        latitude,
        longitude,
        recorded_at,
        'ios',
        JSON.stringify(metadata)
      ]
    )
  }

  it('returns metric objects with required fields', async () => {
    await insert_record({
      latitude: 38.9,
      longitude: -77.0,
      recorded_at: `${snapshot_date}T10:00:00Z`
    })
    const metrics = await collect_location_metrics({
      snapshot_date,
      config,
      pool
    })
    expect(metrics).to.be.an('array')
    for (const metric of metrics) {
      expect(metric).to.include.keys(
        'snapshot_date',
        'category',
        'metric_name',
        'metric_value',
        'unit',
        'dimensions'
      )
      expect(metric.category).to.equal('location')
    }
  })

  it('computes distance_traveled_km and location_tracking_hours', async () => {
    await pool.query(`DELETE FROM locations WHERE user_public_key = $1`, [
      test_user_key
    ])
    // Two points ~1.11 km apart (0.01 deg lat) within a 5-minute gap
    await insert_record({
      latitude: 38.9,
      longitude: -77.0,
      recorded_at: `${snapshot_date}T12:00:00Z`
    })
    await insert_record({
      latitude: 38.91,
      longitude: -77.0,
      recorded_at: `${snapshot_date}T12:05:00Z`
    })

    const metrics = await collect_location_metrics({
      snapshot_date,
      config,
      pool
    })
    const distance = metrics.find((m) => m.metric_name === 'distance_traveled_km')
    const hours = metrics.find((m) => m.metric_name === 'location_tracking_hours')
    expect(distance.metric_value).to.be.closeTo(1.11, 0.1)
    expect(hours.metric_value).to.be.closeTo(5 / 60, 0.01)
  })

  it('reports geofence events from metadata', async () => {
    await pool.query(`DELETE FROM locations WHERE user_public_key = $1`, [
      test_user_key
    ])
    await insert_record({
      latitude: 38.9,
      longitude: -77.0,
      recorded_at: `${snapshot_date}T14:00:00Z`,
      metadata: { geofence_event: 'enter', geofence_region_id: 'home' }
    })
    await insert_record({
      latitude: 38.9,
      longitude: -77.0,
      recorded_at: `${snapshot_date}T18:00:00Z`,
      metadata: { geofence_event: 'exit', geofence_region_id: 'home' }
    })
    const metrics = await collect_location_metrics({
      snapshot_date,
      config,
      pool
    })
    const geofence = metrics.filter((m) => m.metric_name === 'geofence_events')
    expect(geofence).to.have.lengthOf(2)
    const total = geofence.reduce((s, m) => s + m.metric_value, 0)
    expect(total).to.equal(2)
  })

  it('returns zero-value metrics for empty day', async () => {
    await pool.query(`DELETE FROM locations WHERE user_public_key = $1`, [
      test_user_key
    ])
    const metrics = await collect_location_metrics({
      snapshot_date: '2020-01-01',
      config,
      pool
    })
    const report_count = metrics.find(
      (m) => m.metric_name === 'location_report_count' &&
        Object.keys(m.dimensions).length === 0
    )
    const distance = metrics.find((m) => m.metric_name === 'distance_traveled_km')
    expect(report_count.metric_value).to.equal(0)
    expect(distance.metric_value).to.equal(0)
  })
})
