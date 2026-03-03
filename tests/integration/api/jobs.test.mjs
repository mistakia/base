/* global describe it before after */
import chai, { expect } from 'chai'
import chaiHttp from 'chai-http'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

import config from '#config'
import server from '#server'

chai.use(chaiHttp)

describe('API /jobs', function () {
  this.timeout(10000)

  let tmp_dir
  let original_job_tracker

  const TEST_API_KEY = 'test-job-api-key-12345'

  before(async () => {
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
      const res = await chai
        .request(server)
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

      expect(res).to.have.status(201)
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
      const res = await chai
        .request(server)
        .post('/api/jobs/report')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          job_id: 'test-my-script',
          success: false,
          duration_ms: 500,
          exit_code: 1,
          reason: 'Connection timeout'
        })

      expect(res).to.have.status(200)
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
      const res = await chai
        .request(server)
        .post('/api/jobs/report')
        .send({ job_id: 'test-no-auth', success: true })

      expect(res).to.have.status(401)
    })

    it('should return 401 on invalid API key', async () => {
      const res = await chai
        .request(server)
        .post('/api/jobs/report')
        .set('Authorization', 'Bearer wrong-key')
        .send({ job_id: 'test-bad-auth', success: true })

      expect(res).to.have.status(401)
    })

    it('should return 400 on missing required fields', async () => {
      const res = await chai
        .request(server)
        .post('/api/jobs/report')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({ job_id: 'test-missing-fields' })

      expect(res).to.have.status(400)
    })
  })

  describe('GET /api/jobs', () => {
    it('should return list of all jobs', async () => {
      const res = await chai.request(server).get('/api/jobs')

      expect(res).to.have.status(200)
      expect(res.body).to.be.an('array')
      expect(res.body.length).to.be.at.least(1)

      const test_job = res.body.find((j) => j.job_id === 'test-my-script')
      expect(test_job).to.exist
      expect(test_job).to.have.property('source', 'external')
    })
  })

  describe('GET /api/jobs/:job_id', () => {
    it('should return a specific job', async () => {
      const res = await chai
        .request(server)
        .get('/api/jobs/test-my-script')

      expect(res).to.have.status(200)
      expect(res.body).to.have.property('job_id', 'test-my-script')
      expect(res.body).to.have.property('stats')
    })

    it('should return 404 for unknown job', async () => {
      const res = await chai
        .request(server)
        .get('/api/jobs/nonexistent-job')

      expect(res).to.have.status(404)
    })
  })

  describe('Internal source job report', () => {
    it('should handle internal job reporting', async () => {
      // Import report_job directly to simulate worker callback
      const { report_job } = await import(
        '#libs-server/jobs/report-job.mjs'
      )

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
      const res = await chai
        .request(server)
        .get(
          '/api/jobs/internal-2f70e7fb-3821-41ca-8c3a-ec00a489bad9'
        )

      expect(res).to.have.status(200)
      expect(res.body).to.have.property('source', 'internal')
    })
  })
})
