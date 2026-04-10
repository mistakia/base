import path from 'path'

import { expect } from 'chai'
import { request } from '#tests/utils/test-request.mjs'
import server, { mount_extension_routes } from '#server'
import config from '#config'
import {
  reset_all_tables,
  create_test_user,
  authenticate_request
} from '#tests/utils/index.mjs'
import { resolve_user_extension_path } from '#tests/utils/resolve-user-extension-path.mjs'
import {
  get_stats_database_connection,
  close_stats_pool
} from '#libs-server/stats/database.mjs'
import {
  register,
  _reset
} from '#libs-server/extension/capability-registry.mjs'

const has_stats_db = Boolean(config.stats_database?.connection_string)

describe('API /location', function () {
  this.timeout(15000)

  let test_user
  let pool
  let ensure_locations_table
  let reset_locations_table_initialization

  before(async function () {
    if (!has_stats_db) {
      this.skip()
      return
    }
    const extension_dir = resolve_user_extension_path('location-tracking')
    if (!extension_dir) {
      this.skip()
      return
    }

    const http_route_module = await import(
      path.join(extension_dir, 'provide', 'http-route.mjs')
    )
    const table_module = await import(
      path.join(extension_dir, 'lib', 'locations-table.mjs')
    )
    ensure_locations_table = table_module.ensure_locations_table
    reset_locations_table_initialization =
      table_module.reset_locations_table_initialization

    _reset()
    register('http-route', 'location-tracking', http_route_module)
    mount_extension_routes()

    await reset_all_tables()
    test_user = await create_test_user()
    pool = await get_stats_database_connection({ config })
    reset_locations_table_initialization()
    await ensure_locations_table({ pool })
    await pool.query(`DELETE FROM locations WHERE user_public_key = $1`, [
      test_user.user_public_key
    ])
  })

  after(async function () {
    if (!has_stats_db) return
    if (pool) {
      await pool.query(`DELETE FROM locations WHERE user_public_key = $1`, [
        test_user.user_public_key
      ])
    }
    await close_stats_pool()
    await reset_all_tables()
    _reset()
  })

  function make_record(overrides = {}) {
    return {
      latitude: 38.9072,
      longitude: -77.0369,
      altitude: 50,
      horizontal_accuracy: 5,
      vertical_accuracy: 3,
      speed: 1.5,
      course: 90,
      battery_level: 0.85,
      device_id: 'test-device-1',
      recorded_at: new Date().toISOString(),
      metadata: {},
      ...overrides
    }
  }

  describe('POST /api/location/report', () => {
    it('rejects unauthenticated requests', async () => {
      const res = await request(server)
        .post('/api/location/report')
        .send({ locations: [make_record()] })
      expect(res.status).to.equal(401)
    })

    it('accepts a valid batch', async () => {
      const res = await authenticate_request(
        request(server).post('/api/location/report'),
        test_user
      ).send({
        locations: [
          make_record({ recorded_at: '2026-04-10T10:00:00.000Z' }),
          make_record({
            recorded_at: '2026-04-10T10:01:00.000Z',
            latitude: 38.91
          })
        ]
      })
      expect(res.status).to.equal(200)
      expect(res.body).to.have.property('accepted', 2)
      expect(res.body).to.have.property('duplicates', 0)
    })

    it('deduplicates records on repeat submission', async () => {
      const record = make_record({
        recorded_at: '2026-04-10T11:00:00.000Z',
        latitude: 38.92,
        longitude: -77.1
      })
      const first = await authenticate_request(
        request(server).post('/api/location/report'),
        test_user
      ).send({ locations: [record] })
      expect(first.body).to.have.property('accepted', 1)

      const second = await authenticate_request(
        request(server).post('/api/location/report'),
        test_user
      ).send({ locations: [record] })
      expect(second.body).to.have.property('accepted', 0)
      expect(second.body).to.have.property('duplicates', 1)
    })

    it('rejects out-of-range latitude', async () => {
      const res = await authenticate_request(
        request(server).post('/api/location/report'),
        test_user
      ).send({ locations: [make_record({ latitude: 200 })] })
      expect(res.status).to.equal(400)
    })

    it('rejects out-of-range longitude', async () => {
      const res = await authenticate_request(
        request(server).post('/api/location/report'),
        test_user
      ).send({ locations: [make_record({ longitude: -999 })] })
      expect(res.status).to.equal(400)
    })

    it('rejects batches larger than 500 records', async () => {
      const records = Array.from({ length: 501 }, (_, i) =>
        make_record({
          recorded_at: new Date(
            Date.parse('2026-04-10T12:00:00Z') + i * 1000
          ).toISOString(),
          latitude: 38.9 + i * 0.0001
        })
      )
      const res = await authenticate_request(
        request(server).post('/api/location/report'),
        test_user
      ).send({ locations: records })
      expect(res.status).to.equal(400)
    })

    it('stores battery_level, device_id, and metadata', async () => {
      const recorded_at = '2026-04-10T13:00:00.000Z'
      const res = await authenticate_request(
        request(server).post('/api/location/report'),
        test_user
      ).send({
        locations: [
          make_record({
            recorded_at,
            latitude: 38.93,
            longitude: -77.2,
            battery_level: 0.42,
            device_id: 'abc-device',
            metadata: { geofence_event: 'enter', geofence_region_id: 'home' }
          })
        ]
      })
      expect(res.status).to.equal(200)

      const result = await pool.query(
        `SELECT battery_level, device_id, metadata
         FROM locations
         WHERE user_public_key = $1 AND recorded_at = $2`,
        [test_user.user_public_key, recorded_at]
      )
      expect(result.rows).to.have.lengthOf(1)
      expect(Number(result.rows[0].battery_level)).to.be.closeTo(0.42, 1e-6)
      expect(result.rows[0].device_id).to.equal('abc-device')
      expect(result.rows[0].metadata).to.deep.equal({
        geofence_event: 'enter',
        geofence_region_id: 'home'
      })
    })
  })
})
