import assert from 'assert'
import { describe, it } from 'mocha'
import {
  get_timestamp_for_raw_data,
  RAW_DATA_TIMESTAMP_FORMAT
} from '#libs-server/integrations/thread/thread-integration-shared-config.mjs'

describe('Raw Data Timestamp Generation', () => {
  describe('get_timestamp_for_raw_data', () => {
    it('should generate date-only timestamp when format is DATE', () => {
      const timestamp = get_timestamp_for_raw_data(
        RAW_DATA_TIMESTAMP_FORMAT.DATE
      )

      // Should be in YYYY-MM-DD format
      assert.match(timestamp, /^\d{4}-\d{2}-\d{2}$/)

      // Verify it's today's date
      const today = new Date().toISOString().split('T')[0]
      assert.equal(timestamp, today)
    })

    it('should generate full timestamp when format is DATETIME', () => {
      const timestamp = get_timestamp_for_raw_data(
        RAW_DATA_TIMESTAMP_FORMAT.DATETIME
      )

      // Should have colons and dots replaced with hyphens
      assert.match(timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/)

      // Should not contain colons or dots
      assert.equal(timestamp.includes(':'), false)
      assert.equal(timestamp.includes('.'), false)
    })

    it('should default to datetime format when format is undefined', () => {
      const timestamp = get_timestamp_for_raw_data(undefined)

      // Should use datetime format as default
      assert.match(timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/)
    })

    it('should default to datetime format when format is invalid', () => {
      const timestamp = get_timestamp_for_raw_data('invalid')

      // Should use datetime format as default
      assert.match(timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/)
    })
  })

  describe('File naming with different timestamp formats', () => {
    it('should create consistent date-based filenames', () => {
      const date_timestamp = get_timestamp_for_raw_data(
        RAW_DATA_TIMESTAMP_FORMAT.DATE
      )
      const filename = `claude-session-${date_timestamp}.jsonl`

      // Filename should be predictable for a given day
      assert.match(filename, /^claude-session-\d{4}-\d{2}-\d{2}\.jsonl$/)
    })

    it('should create unique datetime-based filenames', () => {
      const datetime_timestamp = get_timestamp_for_raw_data(
        RAW_DATA_TIMESTAMP_FORMAT.DATETIME
      )
      const filename = `claude-session-${datetime_timestamp}.jsonl`

      // Filename should include full timestamp
      assert.match(
        filename,
        /^claude-session-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.jsonl$/
      )
    })
  })
})
