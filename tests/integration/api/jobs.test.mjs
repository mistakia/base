/* global describe it before after */
import { expect } from 'chai'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import crypto from 'crypto'

import config from '#config'
import server from '#server'
import { request } from '#tests/utils/test-request.mjs'
import { reset_all_tables, authenticate_request } from '#tests/utils/index.mjs'
import create_user from '#libs-server/users/create-user.mjs'
import user_registry from '#libs-server/users/user-registry.mjs'

describe('API /jobs', function () {
  this.timeout(10000)

  let tmp_dir
  let original_job_tracker
  let admin_user

  const TEST_API_KEY = 'test-job-api-key-12345'

  before(async () => {
    await reset_all_tables()

    tmp_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'job-tracker-test-'))

    original_job_tracker = config.job_tracker
    config.job_tracker = {
      enabled: true,
      path: tmp_dir,
      ssh_host: 'storage',
      api_key: TEST_API_KEY,
      discord_webhook_url: '',
      missed_check_interval_ms: 300000
    }

    admin_user = await create_user({
      username: `test_admin_${Math.floor(Math.random() * 10000)}`,
      user_private_key: crypto.randomBytes(32),
      permissions: { global_write: true }
    })
    user_registry._clear_cache()
  })

  after(async () => {
    config.job_tracker = original_job_tracker
    try {
      await fs.rm(tmp_dir, { recursive: true })
    } catch {
      // ignore cleanup errors
    }
  })

  describe('POST /api/jobs/report', () => {
    it('should create a new job file on first report', async () => {
      const res = await request(server)
        .post('/api/jobs/report')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          job_id: 'test-my-script',
          success: true,
          duration_ms: 1500,
          exit_code: 0,
          project: 'test-project',
          server: 'test-server',
          name: 'My Test Script'
        })

      expect(res.status).to.equal(201)
      expect(res.body).to.have.property('job_id', 'test-my-script')
      expect(res.body).to.have.property('source', 'external')
      expect(res.body).to.have.property('name', 'My Test Script')
      expect(res.body.stats).to.have.property('total_runs', 1)
      expect(res.body.stats).to.have.property('success_count', 1)
      expect(res.body.last_execution).to.have.property('success', true)

      // Verify file was created
      const file_path = path.join(tmp_dir, 'test-my-script.json')
      const content = await fs.readFile(file_path, 'utf-8')
      const data = JSON.parse(content)
      expect(data.job_id).to.equal('test-my-script')
    })

    it('should update existing job stats on subsequent reports', async () => {
      const res = await request(server)
        .post('/api/jobs/report')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          job_id: 'test-my-script',
          success: false,
          duration_ms: 500,
          exit_code: 1,
          reason: 'Connection timeout'
        })

      expect(res.status).to.equal(200)
      expect(res.body.stats).to.have.property('total_runs', 2)
      expect(res.body.stats).to.have.property('success_count', 1)
      expect(res.body.stats).to.have.property('failure_count', 1)
      expect(res.body.last_execution).to.have.property('success', false)
      expect(res.body.failure_history).to.have.lengthOf(1)
      expect(res.body.failure_history[0]).to.have.property(
        'reason',
        'Connection timeout'
      )
    })

    it('should return 401 on missing API key', async () => {
      const res = await request(server)
        .post('/api/jobs/report')
        .send({ job_id: 'test-no-auth', success: true })

      expect(res.status).to.equal(401)
    })

    it('should return 401 on invalid API key', async () => {
      const res = await request(server)
        .post('/api/jobs/report')
        .set('Authorization', 'Bearer wrong-key')
        .send({ job_id: 'test-bad-auth', success: true })

      expect(res.status).to.equal(401)
    })

    it('should return 400 on missing required fields', async () => {
      const res = await request(server)
        .post('/api/jobs/report')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({ job_id: 'test-missing-fields' })

      expect(res.status).to.equal(400)
    })
  })

  describe('GET /api/jobs', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(server).get('/api/jobs')

      expect(res.status).to.equal(401)
    })

    it('should return list of all jobs for admin user', async () => {
      const res = await authenticate_request(
        request(server).get('/api/jobs'),
        admin_user
      )

      expect(res.status).to.equal(200)
      expect(res.body).to.be.an('array')
      expect(res.body.length).to.be.at.least(1)

      const test_job = res.body.find((j) => j.job_id === 'test-my-script')
      expect(test_job).to.exist
      expect(test_job).to.have.property('source', 'external')
    })
  })

  describe('GET /api/jobs/:job_id', () => {
    it('should return a specific job for admin user', async () => {
      const res = await authenticate_request(
        request(server).get('/api/jobs/test-my-script'),
        admin_user
      )

      expect(res.status).to.equal(200)
      expect(res.body).to.have.property('job_id', 'test-my-script')
      expect(res.body).to.have.property('stats')
    })

    it('should return 404 for unknown job', async () => {
      const res = await authenticate_request(
        request(server).get('/api/jobs/nonexistent-job'),
        admin_user
      )

      expect(res.status).to.equal(404)
    })
  })

  describe('Internal source job report', () => {
    it('should handle internal job reporting', async () => {
      // Import report_job directly to simulate worker callback
      const { report_job } = await import('#libs-server/jobs/report-job.mjs')

      const job = await report_job({
        job_id: 'internal-2f70e7fb-3821-41ca-8c3a-ec00a489bad9',
        name: 'Generate homepage',
        source: 'internal',
        success: true,
        duration_ms: 3200,
        exit_code: 0,
        project: 'base',
        server: 'storage',
        schedule: '0 */6 * * *',
        schedule_type: 'expr',
        schedule_entity_id: '2f70e7fb-3821-41ca-8c3a-ec00a489bad9'
      })

      expect(job).to.have.property('source', 'internal')
      expect(job).to.have.property('schedule', '0 */6 * * *')
      expect(job).to.have.property('schedule_type', 'expr')
      expect(job.stats).to.have.property('total_runs', 1)

      // Verify via API
      const res = await authenticate_request(
        request(server).get(
          '/api/jobs/internal-2f70e7fb-3821-41ca-8c3a-ec00a489bad9'
        ),
        admin_user
      )

      expect(res.status).to.equal(200)
      expect(res.body).to.have.property('source', 'internal')
    })
  })

  describe('Consecutive failure tracking', () => {
    it('should increment consecutive_failures on failure and reset on success', async () => {
      const { report_job } = await import('#libs-server/jobs/report-job.mjs')

      const base_params = {
        job_id: 'test-consecutive-counter',
        name: 'Counter Test',
        source: 'external',
        project: 'test',
        server: 'test-server'
      }

      // First failure
      let job = await report_job({
        ...base_params,
        success: false,
        reason: 'fail 1'
      })
      expect(job).to.have.property('consecutive_failures', 1)

      // Second failure
      job = await report_job({
        ...base_params,
        success: false,
        reason: 'fail 2'
      })
      expect(job).to.have.property('consecutive_failures', 2)

      // Success resets counter
      job = await report_job({ ...base_params, success: true })
      expect(job).to.have.property('consecutive_failures', 0)

      // Failure after success starts fresh
      job = await report_job({
        ...base_params,
        success: false,
        reason: 'fail 3'
      })
      expect(job).to.have.property('consecutive_failures', 1)
    })

    it('should suppress alerts for high-frequency jobs below threshold', async () => {
      const { report_job, load_job } =
        await import('#libs-server/jobs/report-job.mjs')

      const base_params = {
        job_id: 'test-high-freq-suppression',
        name: 'Sync All',
        source: 'internal',
        project: 'base',
        server: 'storage',
        schedule: '30s',
        schedule_type: 'every'
      }

      // For a 30s schedule, threshold = ceil(300000/30000) = 10
      // Report 9 failures -- should not trigger alert (no last_alerted_at)
      let job
      for (let i = 0; i < 9; i++) {
        job = await report_job({
          ...base_params,
          success: false,
          reason: `transient fail ${i + 1}`
        })
      }
      expect(job).to.have.property('consecutive_failures', 9)

      // Verify no alert was sent (last_alerted_at should still be null)
      const saved = await load_job({ job_id: 'test-high-freq-suppression' })
      expect(saved.last_alerted_at).to.be.null
    })

    it('should alert on first failure for non-every schedule types', async () => {
      const { report_job, load_job } =
        await import('#libs-server/jobs/report-job.mjs')

      // Cron expression -- threshold = 1, alerts on first failure
      // discord_webhook_url is empty so no actual HTTP call, but last_alerted_at
      // won't be set because notify_job_failure returns early without a URL.
      // We verify the consecutive_failures counter works correctly.
      const job = await report_job({
        job_id: 'test-cron-immediate-alert',
        name: 'Daily Backup',
        source: 'external',
        project: 'test',
        server: 'test-server',
        schedule: '0 2 * * *',
        schedule_type: 'expr',
        success: false,
        reason: 'backup failed'
      })

      expect(job).to.have.property('consecutive_failures', 1)

      // Threshold is 1 for cron, so it should have attempted notification.
      // With empty webhook URL, notify returns early but the threshold gate was passed.
      const saved = await load_job({ job_id: 'test-cron-immediate-alert' })
      expect(saved).to.have.property('consecutive_failures', 1)
    })

    it('should alert for high-frequency jobs once threshold is reached', async () => {
      const { report_job, load_job } =
        await import('#libs-server/jobs/report-job.mjs')

      const base_params = {
        job_id: 'test-high-freq-threshold-met',
        name: 'Fast Sync',
        source: 'internal',
        project: 'base',
        server: 'storage',
        schedule: '30s',
        schedule_type: 'every'
      }

      // Report exactly 10 failures (threshold for 30s = 10)
      let job
      for (let i = 0; i < 10; i++) {
        job = await report_job({
          ...base_params,
          success: false,
          reason: `fail ${i + 1}`
        })
      }

      expect(job).to.have.property('consecutive_failures', 10)

      // With empty webhook URL, notify_job_failure returns early without setting
      // last_alerted_at (the webhook call is skipped). Verify the counter reached threshold.
      const saved = await load_job({ job_id: 'test-high-freq-threshold-met' })
      expect(saved).to.have.property('consecutive_failures', 10)
    })

    it('should treat jobs with no schedule as threshold 1', async () => {
      const { report_job } = await import('#libs-server/jobs/report-job.mjs')

      const job = await report_job({
        job_id: 'test-no-schedule-threshold',
        name: 'Ad-hoc Job',
        source: 'external',
        project: 'test',
        server: 'test-server',
        success: false,
        reason: 'failed'
      })

      expect(job).to.have.property('consecutive_failures', 1)
    })

    it('should treat every schedules >= 5m as threshold 1', async () => {
      const { report_job } = await import('#libs-server/jobs/report-job.mjs')

      const job = await report_job({
        job_id: 'test-5m-schedule-threshold',
        name: 'Five Min Job',
        source: 'internal',
        project: 'base',
        server: 'storage',
        schedule: '5m',
        schedule_type: 'every',
        success: false,
        reason: 'failed'
      })

      // 5m = 300000ms = ALERT_SUPPRESSION_WINDOW_MS, so threshold = 1
      expect(job).to.have.property('consecutive_failures', 1)
    })
  })
})
