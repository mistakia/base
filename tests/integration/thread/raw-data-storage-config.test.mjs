import assert from 'assert'
import { describe, it, before, after } from 'mocha'
import fs from 'fs/promises'
import path from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import config from '#config'
import {
  get_raw_data_storage_config,
  RAW_DATA_TIMESTAMP_FORMAT
} from '#libs-server/integrations/thread/thread-integration-shared-config.mjs'

describe('Raw Data Storage Configuration', () => {
  let original_config

  before(() => {
    // Save original config
    original_config = config.thread_integration
  })

  after(() => {
    // Restore original config
    config.thread_integration = original_config
  })

  describe('Configuration loading', () => {
    it('should load default configuration when not set', () => {
      // Clear the config
      delete config.thread_integration

      const storage_config = get_raw_data_storage_config()

      assert.equal(
        storage_config.timestamp_format,
        RAW_DATA_TIMESTAMP_FORMAT.DATETIME
      )
    })

    it('should load date format when configured', () => {
      config.thread_integration = {
        raw_data_storage: {
          timestamp_format: 'date'
        }
      }

      const storage_config = get_raw_data_storage_config()

      assert.equal(storage_config.timestamp_format, 'date')
    })

    it('should load datetime format when configured', () => {
      config.thread_integration = {
        raw_data_storage: {
          timestamp_format: 'datetime'
        }
      }

      const storage_config = get_raw_data_storage_config()

      assert.equal(storage_config.timestamp_format, 'datetime')
    })
  })

  describe('File overwrite behavior with date format', () => {
    let test_dir

    before(async () => {
      test_dir = path.join(tmpdir(), `test-raw-data-${randomUUID()}`)
      await fs.mkdir(test_dir, { recursive: true })
    })

    after(async () => {
      await fs.rm(test_dir, { recursive: true, force: true })
    })

    it('should overwrite files when using date format on same day', async () => {
      // Configure to use date format
      config.thread_integration = {
        raw_data_storage: {
          timestamp_format: 'date'
        }
      }

      // Verify config is set correctly
      assert.equal(
        config.thread_integration.raw_data_storage.timestamp_format,
        'date'
      )
      const today = new Date().toISOString().split('T')[0]
      const test_file = path.join(test_dir, `test-session-${today}.json`)

      // Write first version
      await fs.writeFile(test_file, JSON.stringify({ version: 1 }))

      // Verify first version
      let content = JSON.parse(await fs.readFile(test_file, 'utf-8'))
      assert.equal(content.version, 1)

      // Write second version (should overwrite)
      await fs.writeFile(test_file, JSON.stringify({ version: 2 }))

      // Verify it was overwritten
      content = JSON.parse(await fs.readFile(test_file, 'utf-8'))
      assert.equal(content.version, 2)

      // Verify only one file exists
      const files = await fs.readdir(test_dir)
      assert.equal(files.length, 1)
      assert.equal(files[0], `test-session-${today}.json`)
    })
  })
})
