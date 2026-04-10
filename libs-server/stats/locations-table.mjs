/**
 * Locations Table Setup
 *
 * Lazy initialization of the `locations` table in the stats PostgreSQL
 * database. Used by the location report route and the location stats
 * collector. Kept separate from `database.mjs` (which owns the EAV
 * metrics table) so each module has a single responsibility.
 */

import debug from 'debug'

const log = debug('stats:locations-table')

let initialized = false

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS locations (
    id SERIAL PRIMARY KEY,
    user_public_key VARCHAR(64) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    altitude DOUBLE PRECISION,
    horizontal_accuracy DOUBLE PRECISION,
    vertical_accuracy DOUBLE PRECISION,
    speed DOUBLE PRECISION,
    course DOUBLE PRECISION,
    battery_level DOUBLE PRECISION,
    device_id VARCHAR(36),
    recorded_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ DEFAULT NOW(),
    source VARCHAR(20) DEFAULT 'ios',
    metadata JSONB DEFAULT '{}',
    UNIQUE (user_public_key, recorded_at, latitude, longitude)
  )
`

// TODO: Add scheduled DELETE WHERE recorded_at < NOW() - INTERVAL '2 years' once continuous tracking is common

const CREATE_INDEX_STATEMENTS = [
  `CREATE INDEX IF NOT EXISTS idx_locations_recorded_at ON locations (recorded_at)`,
  `CREATE INDEX IF NOT EXISTS idx_locations_user_date ON locations (user_public_key, recorded_at)`,
  `CREATE INDEX IF NOT EXISTS idx_locations_metadata ON locations USING GIN (metadata)`
]

/**
 * Ensure the `locations` table and its indexes exist. Idempotent and
 * guarded by a module-level flag so repeated calls within a process
 * skip the query round-trip.
 */
export async function ensure_locations_table({ pool }) {
  if (initialized) {
    return
  }

  const client = await pool.connect()
  try {
    await client.query(CREATE_TABLE_SQL)
    for (const index_sql of CREATE_INDEX_STATEMENTS) {
      await client.query(index_sql)
    }
    initialized = true
    log('locations table ensured')
  } finally {
    client.release()
  }
}

/**
 * Reset the initialization flag. Intended for tests that recreate the
 * database between runs.
 */
export function reset_locations_table_initialization() {
  initialized = false
}
