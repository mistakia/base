/* global describe it before after */
import { expect } from 'chai'

import { upsert_metrics, query_latest_snapshot, query_metric_series, list_snapshot_dates } from '#libs-server/stats/database.mjs'

/**
 * Stats pipeline integration tests.
 *
 * These tests require the stats_production database to be available.
 * They use a test-specific snapshot_date to avoid interfering with real data.
 */
describe('Stats Pipeline', function () {
  this.timeout(30000)

  const TEST_DATE = '1999-01-01'
  let pool

  before(async function () {
    const config = (await import('#config')).default
    if (!config.stats_database?.connection_string) {
      this.skip()
      return
    }
    const { get_stats_database_connection } = await import('#libs-server/stats/database.mjs')
    pool = await get_stats_database_connection({ config })
  })

  after(async function () {
    if (pool) {
      await pool.query('DELETE FROM metrics WHERE snapshot_date = $1', [TEST_DATE])
      const { close_stats_pool } = await import('#libs-server/stats/database.mjs')
      await close_stats_pool()
    }
  })

  describe('upsert_metrics', () => {
    it('should insert metrics with required fields', async function () {
      const metrics = [
        { snapshot_date: TEST_DATE, category: 'test', metric_name: 'test_a', metric_value: 10, unit: 'count', dimensions: {} },
        { snapshot_date: TEST_DATE, category: 'test', metric_name: 'test_b', metric_value: 20, unit: 'bytes', dimensions: { foo: 'bar' } }
      ]

      const result = await upsert_metrics({ pool, metrics })
      expect(result.upserted).to.equal(2)
    })

    it('should be idempotent on conflict', async function () {
      const metrics = [
        { snapshot_date: TEST_DATE, category: 'test', metric_name: 'test_a', metric_value: 99, unit: 'count', dimensions: {} }
      ]

      await upsert_metrics({ pool, metrics })

      const rows = await pool.query(
        'SELECT metric_value FROM metrics WHERE snapshot_date = $1 AND metric_name = $2 AND dimensions = $3',
        [TEST_DATE, 'test_a', '{}']
      )
      expect(Number(rows.rows[0].metric_value)).to.equal(99)
    })

    it('should handle empty metrics array', async function () {
      const result = await upsert_metrics({ pool, metrics: [] })
      expect(result.upserted).to.equal(0)
    })
  })

  describe('query_latest_snapshot', () => {
    it('should return metrics for the most recent date', async function () {
      const rows = await query_latest_snapshot({ pool })
      expect(rows).to.be.an('array')
      if (rows.length > 0) {
        expect(rows[0]).to.have.property('snapshot_date')
        expect(rows[0]).to.have.property('category')
        expect(rows[0]).to.have.property('metric_name')
        expect(rows[0]).to.have.property('metric_value')
      }
    })
  })

  describe('query_metric_series', () => {
    it('should return time series for a metric', async function () {
      const rows = await query_metric_series({
        pool,
        metric_name: 'test_a',
        from_date: TEST_DATE,
        to_date: TEST_DATE
      })
      expect(rows).to.be.an('array')
      expect(rows.length).to.be.greaterThan(0)
      expect(Number(rows[0].metric_value)).to.equal(99)
    })

    it('should filter by dimensions', async function () {
      const rows = await query_metric_series({
        pool,
        metric_name: 'test_b',
        dimensions: { foo: 'bar' }
      })
      expect(rows).to.be.an('array')
      expect(rows.length).to.be.greaterThan(0)
    })
  })

  describe('list_snapshot_dates', () => {
    it('should return dates with metric counts', async function () {
      const dates = await list_snapshot_dates({ pool })
      expect(dates).to.be.an('array')
      if (dates.length > 0) {
        expect(dates[0]).to.have.property('snapshot_date')
        expect(dates[0]).to.have.property('metric_count')
      }
    })
  })

  describe('collector output format', () => {
    it('entity collector should return valid metric objects', async function () {
      this.timeout(15000)
      try {
        const { collect_entity_metrics } = await import(
          '#libs-server/stats/collector/entity-collector.mjs'
        )
        const metrics = await collect_entity_metrics({ snapshot_date: TEST_DATE })
        expect(metrics).to.be.an('array')
        expect(metrics.length).to.be.greaterThan(0)

        for (const m of metrics) {
          expect(m).to.have.property('snapshot_date', TEST_DATE)
          expect(m).to.have.property('category', 'entities')
          expect(m).to.have.property('metric_name').that.is.a('string')
          expect(m).to.have.property('metric_value').that.is.a('number')
          expect(m).to.have.property('unit').that.is.a('string')
          expect(m).to.have.property('dimensions').that.is.an('object')
        }
      } catch (err) {
        if (err.message.includes('DuckDB')) this.skip()
        throw err
      }
    })

    it('task collector should return valid metric objects', async function () {
      this.timeout(15000)
      try {
        const { collect_task_metrics } = await import(
          '#libs-server/stats/collector/task-collector.mjs'
        )
        const metrics = await collect_task_metrics({ snapshot_date: TEST_DATE })
        expect(metrics).to.be.an('array')

        for (const m of metrics) {
          expect(m).to.have.property('category', 'tasks')
          expect(m).to.have.property('metric_name').that.is.a('string')
          expect(m).to.have.property('metric_value').that.is.a('number')
        }
      } catch (err) {
        if (err.message.includes('DuckDB')) this.skip()
        throw err
      }
    })
  })
})
