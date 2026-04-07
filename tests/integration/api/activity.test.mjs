/* global describe it before after */
import { expect } from 'chai'
import { request } from '#tests/utils/test-request.mjs'

import server from '#server'
import {
  reset_all_tables,
  create_test_user,
  authenticate_request,
  create_temp_test_repo,
  setup_api_test_registry
} from '#tests/utils/index.mjs'

describe('Activity API', function () {
  this.timeout(10000)

  let test_user
  let test_repo
  let registry_cleanup

  before(async () => {
    await reset_all_tables()
    test_user = await create_test_user()

    // Set up temporary repo for filesystem operations
    test_repo = await create_temp_test_repo({
      prefix: 'activity-test-',
      register_directories: true
    })

    // Setup registry for API calls
    registry_cleanup = setup_api_test_registry({
      system_base_directory: test_repo.system_path,
      user_base_directory: test_repo.user_path
    })
  })

  after(async () => {
    // Clean up registry
    if (registry_cleanup) {
      registry_cleanup()
    }

    // Clean up the test repo
    if (test_repo && test_repo.cleanup) {
      test_repo.cleanup()
    }

    await reset_all_tables()
  })

  describe('GET /api/activity/heatmap', () => {
    it('should return activity heatmap data with expected structure', async () => {
      const res = await authenticate_request(
        request(server).get('/api/activity/heatmap'),
        test_user
      )

      expect(res.status).to.equal(200)
      expect(res.body).to.be.an('object')
      expect(res.body).to.have.property('data')
      expect(res.body).to.have.property('max_score')
      expect(res.body).to.have.property('date_range')

      // Verify data is an array
      expect(res.body.data).to.be.an('array')

      // Verify date_range structure
      expect(res.body.date_range).to.be.an('object')
      expect(res.body.date_range).to.have.property('start')
      expect(res.body.date_range).to.have.property('end')

      // Verify max_score is a number
      expect(res.body.max_score).to.be.a('number')
      expect(res.body.max_score).to.be.at.least(0)
    })

    it('should return data entries with all required fields', async () => {
      const res = await authenticate_request(
        request(server).get('/api/activity/heatmap'),
        test_user
      )

      expect(res.status).to.equal(200)

      // If there's any data, verify structure
      if (res.body.data.length > 0) {
        const entry = res.body.data[0]

        expect(entry).to.have.property('date')
        expect(entry).to.have.property('score')
        expect(entry).to.have.property('activity_git_commits')
        expect(entry).to.have.property('activity_git_lines_changed')
        expect(entry).to.have.property('activity_git_files_changed')
        expect(entry).to.have.property('activity_token_usage')
        expect(entry).to.have.property('activity_thread_edits')
        expect(entry).to.have.property('activity_thread_lines_changed')

        // Verify types
        expect(entry.date).to.be.a('string')
        expect(entry.score).to.be.a('number')
        expect(entry.activity_git_commits).to.be.a('number')
        expect(entry.activity_git_lines_changed).to.be.a('number')
        expect(entry.activity_git_files_changed).to.be.a('number')
        expect(entry.activity_token_usage).to.be.a('number')
        expect(entry.activity_thread_edits).to.be.a('number')
        expect(entry.activity_thread_lines_changed).to.be.a('number')

        // Verify date format (YYYY-MM-DD)
        expect(entry.date).to.match(/^\d{4}-\d{2}-\d{2}$/)
      }
    })

    it('should accept days query parameter', async () => {
      const res = await authenticate_request(
        request(server).get('/api/activity/heatmap').query({ days: 30 }),
        test_user
      )

      expect(res.status).to.equal(200)
      expect(res.body).to.have.property('data')
      expect(res.body).to.have.property('date_range')

      // Verify date range spans approximately 30 days
      const start_date = new Date(res.body.date_range.start)
      const end_date = new Date(res.body.date_range.end)
      const days_diff = Math.ceil(
        (end_date - start_date) / (1000 * 60 * 60 * 24)
      )

      // Allow some flexibility (29-31 days)
      expect(days_diff).to.be.at.least(29)
      expect(days_diff).to.be.at.most(31)
    })

    it('should default to 365 days when days parameter is not provided', async () => {
      const res = await authenticate_request(
        request(server).get('/api/activity/heatmap'),
        test_user
      )

      expect(res.status).to.equal(200)
      expect(res.body).to.have.property('date_range')

      const start_date = new Date(res.body.date_range.start)
      const end_date = new Date(res.body.date_range.end)
      const days_diff = Math.ceil(
        (end_date - start_date) / (1000 * 60 * 60 * 24)
      )

      // Should be approximately 365 days (allow some flexibility)
      expect(days_diff).to.be.at.least(364)
      expect(days_diff).to.be.at.most(366)
    })

    it('should handle invalid days parameter gracefully', async () => {
      const res = await authenticate_request(
        request(server).get('/api/activity/heatmap').query({ days: 'invalid' }),
        test_user
      )

      // Should default to 365 when invalid
      expect(res.status).to.equal(200)
      expect(res.body).to.have.property('data')
    })

    it('should calculate max_score correctly', async () => {
      const res = await authenticate_request(
        request(server).get('/api/activity/heatmap'),
        test_user
      )

      expect(res.status).to.equal(200)

      if (res.body.data.length > 0) {
        // max_score should be at least as large as any individual score
        const max_entry_score = Math.max(
          ...res.body.data.map((entry) => entry.score)
        )
        expect(res.body.max_score).to.be.at.least(max_entry_score)
      } else {
        // If no data, max_score should be 0
        expect(res.body.max_score).to.equal(0)
      }
    })

    it('should return data sorted by date', async () => {
      const res = await authenticate_request(
        request(server).get('/api/activity/heatmap'),
        test_user
      )

      expect(res.status).to.equal(200)

      if (res.body.data.length > 1) {
        for (let i = 1; i < res.body.data.length; i++) {
          const prev_date = res.body.data[i - 1].date
          const curr_date = res.body.data[i].date
          expect(curr_date >= prev_date).to.be.true
        }
      }
    })

    it('should work without authentication', async () => {
      // Activity endpoint should be accessible without auth (public data)
      const res = await request(server).get('/api/activity/heatmap')

      expect(res.status).to.equal(200)
      expect(res.body).to.have.property('data')
    })
  })
})
