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
    // Kuzu connections are automatically cleaned up
    kuzu_connection = null
  }

  if (kuzu_database) {
    kuzu_database = null
  }

  database_path = null
  log('Kuzu connection closed')
}

export function get_kuzu_database_path() {
  return database_path
}

export function is_kuzu_initialized() {
  return kuzu_connection !== null
}

export const kuzu_database_client = {
  initialize: initialize_kuzu_client,
  get_connection: get_kuzu_connection,
  execute_query: execute_kuzu_query,
  close: close_kuzu_connection,
  get_database_path: get_kuzu_database_path
}
