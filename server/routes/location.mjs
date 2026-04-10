import express from 'express'
import debug from 'debug'

import config from '#config'
import { get_stats_database_connection } from '#libs-server/stats/database.mjs'
import { ensure_locations_table } from '#libs-server/stats/locations-table.mjs'

const router = express.Router({ mergeParams: true })
const log = debug('api:location')

const MAX_BATCH_SIZE = 500

function is_finite_number(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function validate_record(record) {
  if (!record || typeof record !== 'object') {
    return 'record must be an object'
  }
  if (!is_finite_number(record.latitude) || record.latitude < -90 || record.latitude > 90) {
    return 'latitude must be a number between -90 and 90'
  }
  if (!is_finite_number(record.longitude) || record.longitude < -180 || record.longitude > 180) {
    return 'longitude must be a number between -180 and 180'
  }
  if (!record.recorded_at || typeof record.recorded_at !== 'string') {
    return 'recorded_at is required'
  }
  const ts = Date.parse(record.recorded_at)
  if (Number.isNaN(ts)) {
    return 'recorded_at must be a valid ISO 8601 timestamp'
  }
  return null
}

router.post('/report', async (req, res) => {
  const user_public_key = req.user?.user_public_key
  if (!user_public_key) {
    return res.status(401).send({ error: 'authentication required' })
  }

  const { locations } = req.body || {}
  if (!Array.isArray(locations)) {
    return res.status(400).send({ error: 'locations array required' })
  }
  if (locations.length === 0) {
    return res.status(200).send({ accepted: 0, duplicates: 0 })
  }
  if (locations.length > MAX_BATCH_SIZE) {
    return res.status(400).send({
      error: `batch size exceeds limit of ${MAX_BATCH_SIZE}`
    })
  }

  for (let i = 0; i < locations.length; i++) {
    const err = validate_record(locations[i])
    if (err) {
      return res.status(400).send({ error: `locations[${i}]: ${err}` })
    }
  }

  try {
    const pool = await get_stats_database_connection({ config })
    await ensure_locations_table({ pool })

    const columns = [
      'user_public_key',
      'latitude',
      'longitude',
      'altitude',
      'horizontal_accuracy',
      'vertical_accuracy',
      'speed',
      'course',
      'battery_level',
      'device_id',
      'recorded_at',
      'source',
      'metadata'
    ]
    const column_count = columns.length

    const values = []
    const placeholders = []
    let idx = 1
    for (const record of locations) {
      const row_placeholders = []
      for (let c = 0; c < column_count; c++) {
        row_placeholders.push(`$${idx++}`)
      }
      placeholders.push(`(${row_placeholders.join(', ')})`)
      values.push(
        user_public_key,
        record.latitude,
        record.longitude,
        record.altitude ?? null,
        record.horizontal_accuracy ?? null,
        record.vertical_accuracy ?? null,
        record.speed ?? null,
        record.course ?? null,
        record.battery_level ?? null,
        record.device_id ?? null,
        record.recorded_at,
        record.source || 'ios',
        JSON.stringify(record.metadata || {})
      )
    }

    const sql = `
      INSERT INTO locations (${columns.join(', ')})
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (user_public_key, recorded_at, latitude, longitude) DO NOTHING
    `

    const result = await pool.query(sql, values)
    const accepted = result.rowCount
    const duplicates = locations.length - accepted

    log(
      'location report: user=%s submitted=%d accepted=%d duplicates=%d',
      user_public_key,
      locations.length,
      accepted,
      duplicates
    )

    return res.send({ accepted, duplicates })
  } catch (error) {
    log('location report error: %s', error.message)
    return res.status(500).send({ error: error.message })
  }
})

export default router
