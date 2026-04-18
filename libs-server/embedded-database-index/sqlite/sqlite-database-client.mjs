/**
 * SQLite Database Client
 *
 * Manages connection to embedded SQLite database using bun:sqlite.
 */

import { AsyncLocalStorage } from 'node:async_hooks'
import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'

const log = debug('embedded-index:sqlite')

let sqlite_database = null
let database_path = null

const reader_context = new AsyncLocalStorage()

export async function initialize_sqlite_client({
  database_path: db_path,
  in_memory = false
}) {
  if (sqlite_database) {
    log('SQLite client already initialized')
    return
  }

  database_path = in_memory ? ':memory:' : db_path
  log('Initializing SQLite client at %s', database_path)

  if (!in_memory && db_path) {
    const dir = path.dirname(db_path)
    await fs.mkdir(dir, { recursive: true })
  }

  const { Database } = await import('bun:sqlite')

  sqlite_database = new Database(database_path)

  sqlite_database.exec('PRAGMA journal_mode=WAL')
  sqlite_database.exec('PRAGMA synchronous=NORMAL')
  sqlite_database.exec('PRAGMA busy_timeout=5000')

  log('SQLite client initialized')
}

export async function with_sqlite_reader({ database_path: db_path }, fn) {
  const { Database } = await import('bun:sqlite')
  const db = new Database(db_path, { readonly: true })
  db.exec('PRAGMA busy_timeout=5000')
  try {
    return await reader_context.run({ db }, fn)
  } finally {
    db.close()
  }
}

function get_active_database() {
  const store = reader_context.getStore()
  if (store?.db) return store.db
  if (!sqlite_database) {
    throw new Error('SQLite client not initialized')
  }
  return sqlite_database
}

export async function execute_sqlite_query({ query, parameters = [] }) {
  const db = get_active_database()

  log('Executing SQLite query: %s', query.substring(0, 100))

  const sanitized_parameters = parameters.map((p) =>
    p === undefined ? null : p
  )

  try {
    const stmt = db.prepare(query)
    const result = stmt.all(...sanitized_parameters)
    return result
  } catch (error) {
    log('SQLite query error: %s', error.message)
    throw error
  }
}

export async function execute_sqlite_run({ query, parameters = [] }) {
  const db = get_active_database()

  log('Executing SQLite run: %s', query.substring(0, 100))

  const sanitized_parameters = parameters.map((p) =>
    p === undefined ? null : p
  )

  try {
    const stmt = db.prepare(query)
    stmt.run(...sanitized_parameters)
  } catch (error) {
    log('SQLite run error: %s', error.message)
    throw error
  }
}

export async function close_sqlite_connection() {
  if (sqlite_database) {
    sqlite_database.close()
    sqlite_database = null
    database_path = null
    log('SQLite connection closed')
  }
}

export function get_sqlite_database_path() {
  return database_path
}

export function is_sqlite_initialized() {
  return sqlite_database !== null
}

/**
 * Force a WAL checkpoint to persist all changes to the main database file.
 * This ensures data survives ungraceful shutdowns (e.g., SIGKILL from PM2).
 */
export async function checkpoint_sqlite() {
  if (!sqlite_database) {
    throw new Error('SQLite client not initialized')
  }

  log('Forcing SQLite checkpoint')
  sqlite_database.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  log('SQLite checkpoint complete')
}

/**
 * Get the raw bun:sqlite Database instance for advanced operations.
 * Use sparingly -- prefer execute_sqlite_query/execute_sqlite_run.
 */
export function get_sqlite_database() {
  if (!sqlite_database) {
    throw new Error(
      'SQLite client not initialized. Call initialize_sqlite_client first.'
    )
  }
  return sqlite_database
}

export const sqlite_database_client = {
  initialize: initialize_sqlite_client,
  execute_query: execute_sqlite_query,
  execute_run: execute_sqlite_run,
  close: close_sqlite_connection,
  get_database_path: get_sqlite_database_path,
  checkpoint: checkpoint_sqlite
}
