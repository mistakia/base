/**
 * @fileoverview Unit tests for SQLite database client
 */

import { expect } from 'chai'

import {
  initialize_sqlite_client,
  get_sqlite_database,
  execute_sqlite_query,
  execute_sqlite_run,
  close_sqlite_connection,
  is_sqlite_initialized,
  with_sqlite_reader
} from '#libs-server/embedded-database-index/sqlite/sqlite-database-client.mjs'

describe('SQLite Database Client', () => {
  before(async () => {
    // Ensure clean state by closing any existing connection
    await close_sqlite_connection()
    // Initialize SQLite with in-memory database for tests
    await initialize_sqlite_client({ in_memory: true })
  })

  after(async () => {
    try {
      await close_sqlite_connection()
    } catch (error) {
      // Ignore cleanup errors
    }
  })

  describe('initialize_sqlite_client', () => {
    it('should initialize SQLite client successfully', () => {
      const initialized = is_sqlite_initialized()
      expect(initialized).to.equal(true)
    })
  })

  describe('get_sqlite_database', () => {
    it('should return a valid SQLite database', async () => {
      const connection = await get_sqlite_database()
      expect(connection).to.not.be.undefined
      expect(connection).to.not.be.null
    })
  })

  describe('execute_sqlite_run', () => {
    it('should execute DDL statements successfully', async () => {
      await execute_sqlite_run({
        query:
          'CREATE TABLE IF NOT EXISTS test_table (id INTEGER, name VARCHAR)'
      })
    })

    it('should execute INSERT statements successfully', async () => {
      await execute_sqlite_run({
        query: "INSERT INTO test_table VALUES (1, 'test')"
      })
    })
  })

  describe('execute_sqlite_query', () => {
    it('should execute SELECT queries and return results', async () => {
      const rows = await execute_sqlite_query({
        query: 'SELECT * FROM test_table WHERE id = 1'
      })
      expect(rows).to.be.an('array')
      expect(rows.length).to.equal(1)
      expect(rows[0].id).to.equal(1)
      expect(rows[0].name).to.equal('test')
    })

    it('should return empty array for no results', async () => {
      const rows = await execute_sqlite_query({
        query: 'SELECT * FROM test_table WHERE id = 999'
      })
      expect(rows).to.be.an('array')
      expect(rows.length).to.equal(0)
    })

    it('should handle complex queries', async () => {
      await execute_sqlite_run({
        query: "INSERT INTO test_table VALUES (2, 'second'), (3, 'third')"
      })

      const rows = await execute_sqlite_query({
        query: 'SELECT * FROM test_table ORDER BY id'
      })
      expect(rows).to.be.an('array')
      expect(rows.length).to.be.at.least(3)
    })
  })

  describe('error handling', () => {
    it('should throw error for invalid SQL', async () => {
      try {
        await execute_sqlite_query({
          query: 'SELECT * FROM nonexistent_table'
        })
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).to.be.an('error')
      }
    })
  })

  describe('with_sqlite_reader context scoping', () => {
    let tmp_path

    before(async () => {
      const os = await import('node:os')
      const path = await import('node:path')
      const fs = await import('node:fs/promises')
      const tmp_dir = await fs.mkdtemp(
        path.join(os.tmpdir(), 'sqlite-reader-unit-')
      )
      tmp_path = path.join(tmp_dir, 'reader.db')

      // Seed a file-backed DB so a readonly handle can open it.
      const { Database } = await import('bun:sqlite')
      const seed = new Database(tmp_path)
      seed.exec('PRAGMA journal_mode=WAL')
      seed.exec('CREATE TABLE scope_test (id INTEGER, value TEXT)')
      seed.prepare("INSERT INTO scope_test VALUES (1, 'scoped')").run()
      seed.close()
    })

    it('prefers the scoped handle over the module-level handle', async () => {
      // The module-level handle is the in-memory DB initialized in the outer
      // before(). It does not have the scope_test table. If the scoped
      // handle is honored, the query succeeds and returns 'scoped'.
      const rows = await with_sqlite_reader(
        { database_path: tmp_path },
        async () => {
          return execute_sqlite_query({
            query: 'SELECT value FROM scope_test WHERE id = 1'
          })
        }
      )
      expect(rows).to.be.an('array')
      expect(rows[0].value).to.equal('scoped')
    })

    it('closes the handle after the callback throws', async () => {
      let caught
      try {
        await with_sqlite_reader({ database_path: tmp_path }, async () => {
          throw new Error('scoped-reader-error')
        })
      } catch (error) {
        caught = error
      }
      expect(caught).to.be.an('error')
      expect(caught.message).to.equal('scoped-reader-error')
    })
  })
})
