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

export async function initialize_duckdb_client({
  database_path: db_path,
  in_memory = false
}) {
  if (duckdb_connection) {
    log('DuckDB client already initialized')
    return
  }

  database_path = in_memory ? ':memory:' : db_path
  log('Initializing DuckDB client at %s', database_path)

  if (!in_memory && db_path) {
    // Ensure directory exists
    const dir = path.dirname(db_path)
    await fs.mkdir(dir, { recursive: true })
  }

  // Dynamic import to handle cases where duckdb is not installed
  const duckdb = await import('duckdb')

  return new Promise((resolve, reject) => {
    duckdb_instance = new duckdb.default.Database(database_path, (err) => {
      if (err) {
        log('Error opening DuckDB database: %s', err.message)
        reject(err)
        return
      }

      duckdb_connection = duckdb_instance.connect()
      log('DuckDB client initialized')
      resolve()
    })
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

export const duckdb_database_client = {
  initialize: initialize_duckdb_client,
  get_connection: get_duckdb_connection,
  execute_query: execute_duckdb_query,
  execute_run: execute_duckdb_run,
  close: close_duckdb_connection,
  get_database_path: get_duckdb_database_path
}
