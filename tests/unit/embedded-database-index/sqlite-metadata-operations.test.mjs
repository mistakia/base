/**
 * @fileoverview Unit tests for SQLite index metadata operations
 */

import { expect } from 'chai'

import {
  initialize_sqlite_client,
  execute_sqlite_run,
  close_sqlite_connection
} from '#libs-server/embedded-database-index/sqlite/sqlite-database-client.mjs'
import {
  get_index_metadata,
  set_index_metadata,
  INDEX_METADATA_KEYS
} from '#libs-server/embedded-database-index/sqlite/sqlite-metadata-operations.mjs'

describe('SQLite Index Metadata Operations', () => {
  before(async () => {
    await close_sqlite_connection()
    await initialize_sqlite_client({ in_memory: true })
    await execute_sqlite_run({
      query: `
        CREATE TABLE IF NOT EXISTS index_metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `
    })
  })

  after(async () => {
    try {
      await close_sqlite_connection()
    } catch (error) {
      // ignore cleanup errors
    }
  })

  describe('set_index_metadata', () => {
    it('should reject null values with the key in the error message', async () => {
      let caught = null
      try {
        await set_index_metadata({
          key: INDEX_METADATA_KEYS.REBUILD_IN_PROGRESS,
          value: null
        })
      } catch (error) {
        caught = error
      }
      expect(caught).to.be.an.instanceOf(TypeError)
      expect(caught.message).to.include(INDEX_METADATA_KEYS.REBUILD_IN_PROGRESS)
    })

    it('should reject undefined values', async () => {
      let caught = null
      try {
        await set_index_metadata({ key: 'some_key', value: undefined })
      } catch (error) {
        caught = error
      }
      expect(caught).to.be.an.instanceOf(TypeError)
    })

    it('should round-trip a string value via get_index_metadata', async () => {
      await set_index_metadata({
        key: INDEX_METADATA_KEYS.REBUILD_IN_PROGRESS,
        value: 'false'
      })
      const value = await get_index_metadata({
        key: INDEX_METADATA_KEYS.REBUILD_IN_PROGRESS
      })
      expect(value).to.equal('false')
    })

    it('should upsert when the key already exists', async () => {
      await set_index_metadata({ key: 'schema_version', value: '5' })
      await set_index_metadata({ key: 'schema_version', value: '6' })
      const value = await get_index_metadata({ key: 'schema_version' })
      expect(value).to.equal('6')
    })
  })
})
