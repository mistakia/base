import { expect } from 'chai'
import http from 'node:http'

import { http_report_job } from '#libs-server/jobs/http-report-job.mjs'

describe('http_report_job', function () {
  this.timeout(15000)

  let server
  let server_port
  let last_request_body
  let last_request_headers
  let response_status
  let response_body

  before((done) => {
    server = http.createServer((req, res) => {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk
      })
      req.on('end', () => {
        last_request_body = JSON.parse(body)
        last_request_headers = req.headers
        res.writeHead(response_status, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(response_body))
      })
    })
    server.listen(0, () => {
      server_port = server.address().port
      done()
    })
  })

  after((done) => {
    server.close(done)
  })

  beforeEach(() => {
    last_request_body = null
    last_request_headers = null
    response_status = 200
    response_body = { job_id: 'test-job' }
  })

  it('should return success on 200 response', async () => {
    response_status = 200

    const result = await http_report_job({
      api_url: `http://localhost:${server_port}`,
      api_key: 'test-key',
      payload: { job_id: 'test-job', success: true }
    })

    expect(result).to.deep.equal({ success: true })
    expect(last_request_body).to.deep.equal({
      job_id: 'test-job',
      success: true
    })
    expect(last_request_headers.authorization).to.equal('Bearer test-key')
    expect(last_request_headers['content-type']).to.equal('application/json')
  })

  it('should return success on 201 response', async () => {
    response_status = 201

    const result = await http_report_job({
      api_url: `http://localhost:${server_port}`,
      api_key: 'test-key',
      payload: { job_id: 'new-job', success: true }
    })

    expect(result).to.deep.equal({ success: true })
  })

  it('should return failure on non-2xx response', async () => {
    response_status = 401
    response_body = { error: 'Invalid API key' }

    const result = await http_report_job({
      api_url: `http://localhost:${server_port}`,
      api_key: 'wrong-key',
      payload: { job_id: 'test-job', success: true }
    })

    expect(result.success).to.be.false
    expect(result.error).to.include('HTTP 401')
  })

  it('should return failure on network error without throwing', async () => {
    const result = await http_report_job({
      api_url: 'http://localhost:1',
      api_key: 'test-key',
      payload: { job_id: 'test-job', success: true }
    })

    expect(result.success).to.be.false
    expect(result.error).to.be.a('string')
  })

  it('should handle timeout', async () => {
    // Create a server that never responds
    const slow_server = http.createServer(() => {
      // intentionally no response
    })
    await new Promise((resolve) => slow_server.listen(0, resolve))
    const slow_port = slow_server.address().port

    try {
      const result = await http_report_job({
        api_url: `http://localhost:${slow_port}`,
        api_key: 'test-key',
        payload: { job_id: 'test-job', success: true }
      })

      expect(result.success).to.be.false
      expect(result.error).to.include('Timeout')
    } finally {
      slow_server.close()
    }
  })
})
