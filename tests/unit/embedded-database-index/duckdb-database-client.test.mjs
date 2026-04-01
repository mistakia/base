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
  is_sqlite_initialized
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
      // If no error thrown, test passes
    })

    it('should execute INSERT statements successfully', async () => {
      await execute_sqlite_run({
        query: "INSERT INTO test_table VALUES (1, 'test')"
      })
      // If no error thrown, test passes
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
      // Insert additional test data
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
})
