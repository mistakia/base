/**
 * DuckDB Database Client
 *
 * Manages connection to embedded DuckDB analytical database.
 */

import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'

const log = debug('embedded-index:duckdb')

let duckdb_instance = null
let duckdb_connection = null
let database_path = null
let connection_read_only = false

export async function initialize_duckdb_client({
  database_path: db_path,
  in_memory = false,
  read_only = false
}) {
  if (duckdb_connection) {
    log('DuckDB client already initialized')
    return
  }

  database_path = in_memory ? ':memory:' : db_path
  connection_read_only = read_only
  log(
    'Initializing DuckDB client at %s (read_only: %s)',
    database_path,
    read_only
  )

  if (!in_memory && db_path) {
    // Ensure directory exists
    const dir = path.dirname(db_path)
    await fs.mkdir(dir, { recursive: true })
  }

  // Dynamic import to handle cases where duckdb is not installed
  const duckdb = await import('duckdb')

  return new Promise((resolve, reject) => {
    const on_open = (err) => {
      if (err) {
        log('Error opening DuckDB database: %s', err.message)
        reject(err)
        return
      }

      duckdb_connection = duckdb_instance.connect()
      log('DuckDB client initialized (read_only: %s)', read_only)
      resolve()
    }

    if (read_only) {
      duckdb_instance = new duckdb.default.Database(
        database_path,
        { access_mode: 'READ_ONLY' },
        on_open
      )
    } else {
      duckdb_instance = new duckdb.default.Database(database_path, on_open)
    }
  })
}

export async function get_duckdb_connection() {
  if (!duckdb_connection) {
    throw new Error(
      'DuckDB client not initialized. Call initialize_duckdb_client first.'
    )
  }
  return duckdb_connection
}

export async function execute_duckdb_query({ query, parameters = [] }) {
  if (!duckdb_connection) {
    throw new Error('DuckDB client not initialized')
  }

  log('Executing DuckDB query: %s', query.substring(0, 100))

  // Sanitize parameters: convert undefined to null for DuckDB compatibility
  const sanitized_parameters = parameters.map((p) =>
    p === undefined ? null : p
  )

  return new Promise((resolve, reject) => {
    if (sanitized_parameters.length > 0) {
      duckdb_connection.all(query, ...sanitized_parameters, (err, result) => {
        if (err) {
          log('DuckDB query error: %s', err.message)
          reject(err)
          return
        }
        resolve(result)
      })
    } else {
      duckdb_connection.all(query, (err, result) => {
        if (err) {
          log('DuckDB query error: %s', err.message)
          reject(err)
          return
        }
        resolve(result)
      })
    }
  })
}

export async function execute_duckdb_run({ query, parameters = [] }) {
  if (!duckdb_connection) {
    throw new Error('DuckDB client not initialized')
  }

  log('Executing DuckDB run: %s', query.substring(0, 100))

  // Sanitize parameters: convert undefined to null for DuckDB compatibility
  const sanitized_parameters = parameters.map((p) =>
    p === undefined ? null : p
  )

  return new Promise((resolve, reject) => {
    if (sanitized_parameters.length > 0) {
      duckdb_connection.run(query, ...sanitized_parameters, (err) => {
        if (err) {
          log('DuckDB run error: %s', err.message)
          reject(err)
          return
        }
        resolve()
      })
    } else {
      duckdb_connection.run(query, (err) => {
        if (err) {
          log('DuckDB run error: %s', err.message)
          reject(err)
          return
        }
        resolve()
      })
    }
  })
}

export async function close_duckdb_connection() {
  return new Promise((resolve) => {
    if (duckdb_instance) {
      duckdb_instance.close(() => {
        duckdb_connection = null
        duckdb_instance = null
        database_path = null
        connection_read_only = false
        log('DuckDB connection closed')
        resolve()
      })
    } else {
      resolve()
    }
  })
}

export function get_duckdb_database_path() {
  return database_path
}

export function is_duckdb_initialized() {
  return duckdb_connection !== null
}

export function is_duckdb_read_only() {
  return connection_read_only
}

/**
 * Force a WAL checkpoint to persist all changes to the main database file.
 * This ensures data survives ungraceful shutdowns (e.g., SIGKILL from PM2).
 */
export async function checkpoint_duckdb() {
  if (!duckdb_connection) {
    throw new Error('DuckDB client not initialized')
  }

  log('Forcing DuckDB checkpoint')

  return new Promise((resolve, reject) => {
    duckdb_connection.run('CHECKPOINT', (err) => {
      if (err) {
        log('DuckDB checkpoint error: %s', err.message)
        reject(err)
        return
      }
      log('DuckDB checkpoint complete')
      resolve()
    })
  })
}

export const duckdb_database_client = {
  initialize: initialize_duckdb_client,
  get_connection: get_duckdb_connection,
  execute_query: execute_duckdb_query,
  execute_run: execute_duckdb_run,
  close: close_duckdb_connection,
  get_database_path: get_duckdb_database_path,
  is_read_only: is_duckdb_read_only,
  checkpoint: checkpoint_duckdb
}
