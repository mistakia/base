/**
 * @fileoverview Unit tests for Kuzu database client
 */

import { expect } from 'chai'
import fs from 'fs'
import path from 'path'
import os from 'os'

import {
  initialize_kuzu_client,
  get_kuzu_connection,
  execute_kuzu_query,
  close_kuzu_connection,
  is_kuzu_initialized
} from '#libs-server/embedded-database-index/kuzu/kuzu-database-client.mjs'

describe('Kuzu Database Client', () => {
  let test_db_path

  before(async () => {
    // Create temporary directory for test database
    test_db_path = path.join(os.tmpdir(), `kuzu-test-${Date.now()}`)
    fs.mkdirSync(test_db_path, { recursive: true })

    // Initialize Kuzu with test database path
    await initialize_kuzu_client({ database_path: test_db_path })
  })

  after(async () => {
    await close_kuzu_connection()

    // Cleanup test directory
    if (test_db_path && fs.existsSync(test_db_path)) {
      fs.rmSync(test_db_path, { recursive: true, force: true })
    }
  })

  describe('initialize_kuzu_client', () => {
    it('should initialize Kuzu client successfully', () => {
      const initialized = is_kuzu_initialized()
      expect(initialized).to.equal(true)
    })
  })

  describe('get_kuzu_connection', () => {
    it('should return a valid Kuzu connection', async () => {
      const connection = await get_kuzu_connection()
      expect(connection).to.not.be.undefined
      expect(connection).to.not.be.null
    })
  })

  describe('execute_kuzu_query', () => {
    before(async () => {
      // Create test node table
      await execute_kuzu_query({
        query:
          'CREATE NODE TABLE IF NOT EXISTS TestNode(id STRING PRIMARY KEY, name STRING)'
      })

      // Insert test data
      await execute_kuzu_query({
        query: "CREATE (n:TestNode {id: 'test1', name: 'Test One'})"
      })
      await execute_kuzu_query({
        query: "CREATE (n:TestNode {id: 'test2', name: 'Test Two'})"
      })
    })

    it('should execute Cypher queries and return results', async () => {
      const result = await execute_kuzu_query({
        query:
          "MATCH (n:TestNode) WHERE n.id = 'test1' RETURN n.id AS id, n.name AS name"
      })

      // Kuzu returns a QueryResult object, need to get all rows
      const rows = await result.getAll()
      expect(rows).to.be.an('array')
      expect(rows.length).to.equal(1)
      expect(rows[0].id).to.equal('test1')
      expect(rows[0].name).to.equal('Test One')
    })

    it('should return empty array for no results', async () => {
      const result = await execute_kuzu_query({
        query: "MATCH (n:TestNode) WHERE n.id = 'nonexistent' RETURN n.id AS id"
      })

      const rows = await result.getAll()
      expect(rows).to.be.an('array')
      expect(rows.length).to.equal(0)
    })

    it('should handle queries returning multiple results', async () => {
      const result = await execute_kuzu_query({
        query: 'MATCH (n:TestNode) RETURN n.id AS id ORDER BY n.id'
      })

      const rows = await result.getAll()
      expect(rows).to.be.an('array')
      expect(rows.length).to.equal(2)
    })
  })

  describe('error handling', () => {
    it('should throw error for invalid Cypher syntax', async () => {
      try {
        await execute_kuzu_query({
          query: 'INVALID CYPHER QUERY'
        })
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).to.be.an('error')
      }
    })
  })
})
