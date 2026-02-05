/**
 * Kuzu Database Client
 *
 * Manages connection to embedded Kuzu graph database.
 */

import fs from 'fs/promises'
import debug from 'debug'

const log = debug('embedded-index:kuzu')

let kuzu_database = null
let kuzu_connection = null
let database_path = null

export async function initialize_kuzu_client({ database_path: db_path }) {
  if (kuzu_database) {
    log('Kuzu client already initialized')
    return
  }

  database_path = db_path
  log('Initializing Kuzu client at %s', database_path)

  // Ensure directory exists
  await fs.mkdir(database_path, { recursive: true })

  // Dynamic import to handle cases where kuzu is not installed
  const kuzu = await import('kuzu')

  kuzu_database = new kuzu.Database(database_path)
  kuzu_connection = new kuzu.Connection(kuzu_database)

  log('Kuzu client initialized')
}

export async function get_kuzu_connection() {
  if (!kuzu_connection) {
    throw new Error(
      'Kuzu client not initialized. Call initialize_kuzu_client first.'
    )
  }
  return kuzu_connection
}

export async function execute_kuzu_query({ query, parameters = {} }) {
  if (!kuzu_connection) {
    throw new Error('Kuzu client not initialized')
  }

  log('Executing Kuzu query: %s', query.substring(0, 100))

  try {
    // If parameters are provided, use prepare + execute
    // Otherwise use the simpler query method
    if (parameters && Object.keys(parameters).length > 0) {
      const prepared_statement = await kuzu_connection.prepare(query)
      const result = await kuzu_connection.execute(
        prepared_statement,
        parameters
      )
      return result
    } else {
      const result = await kuzu_connection.query(query)
      return result
    }
  } catch (error) {
    log('Kuzu query error: %s', error.message)
    throw error
  }
}

export async function close_kuzu_connection() {
  if (kuzu_connection) {
    try {
      await kuzu_connection.close()
      log('Kuzu connection closed')
    } catch (error) {
      log('Error closing Kuzu connection: %s', error.message)
    }
    kuzu_connection = null
  }

  if (kuzu_database) {
    try {
      await kuzu_database.close()
      log('Kuzu database closed')
    } catch (error) {
      log('Error closing Kuzu database: %s', error.message)
    }
    kuzu_database = null
  }

  database_path = null
}

export function get_kuzu_database_path() {
  return database_path
}

/**
 * Close Kuzu and remove the database directory.
 * Used for recovery from WAL corruption where the native library
 * leaks memory during failed recovery attempts.
 */
export async function destroy_kuzu_database() {
  const path_to_remove = database_path

  // Close connection and database first
  await close_kuzu_connection()

  // Remove the corrupted database directory
  if (path_to_remove) {
    log('Removing corrupted Kuzu database at %s', path_to_remove)
    await fs.rm(path_to_remove, { recursive: true, force: true })
    log('Corrupted Kuzu database removed')
  }
}

export function is_kuzu_initialized() {
  return kuzu_connection !== null
}

export const kuzu_database_client = {
  initialize: initialize_kuzu_client,
  get_connection: get_kuzu_connection,
  execute_query: execute_kuzu_query,
  close: close_kuzu_connection,
  destroy: destroy_kuzu_database,
  get_database_path: get_kuzu_database_path
}
