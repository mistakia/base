import https from 'node:https'
import http from 'node:http'
import debug from 'debug'

const log = debug('jobs:http-report')

const TIMEOUT_MS = 10000
const MAX_RESPONSE_BYTES = 512

/**
 * Report a job execution result via HTTP API.
 * Used by non-storage machines to report to the storage server's API.
 *
 * @param {Object} params
 * @param {string} params.api_url - Base URL of the API server (e.g. https://storage.localdomain:8081)
 * @param {string} params.api_key - Bearer token for authentication
 * @param {Object} params.payload - Job report payload (job_id, success, reason, etc.)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export const http_report_job = ({ api_url, api_key, payload }) => {
  return new Promise((resolve) => {
    const url = new URL('/api/jobs/report', api_url)
    const body = JSON.stringify(payload)
    const is_https = url.protocol === 'https:'
    const transport = is_https ? https : http
    let settled = false

    const settle = (result) => {
      if (!settled) {
        settled = true
        resolve(result)
      }
    }

    const options = {
      method: 'POST',
      hostname: url.hostname,
      port: url.port || (is_https ? 443 : 80),
      path: url.pathname,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        Authorization: `Bearer ${api_key}`
      },
      timeout: TIMEOUT_MS,
      ...(is_https && { rejectUnauthorized: false })
    }

    const req = transport.request(options, (res) => {
      let data = ''
      let bytes = 0
      res.on('data', (chunk) => {
        bytes += chunk.length
        if (bytes <= MAX_RESPONSE_BYTES) {
          data += chunk
        } else {
          res.destroy()
        }
      })
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          log('HTTP report success: %s %d', payload.job_id, res.statusCode)
          settle({ success: true })
        } else {
          const msg = `HTTP ${res.statusCode}: ${data.slice(0, 200)}`
          log('HTTP report failed: %s', msg)
          settle({ success: false, error: msg })
        }
      })
    })

    req.on('timeout', () => {
      req.destroy()
      log('HTTP report timeout: %s', payload.job_id)
      settle({ success: false, error: `Timeout after ${TIMEOUT_MS}ms` })
    })

    req.on('error', (err) => {
      log('HTTP report error: %s %s', payload.job_id, err.message)
      settle({ success: false, error: err.message })
    })

    req.write(body)
    req.end()
  })
}
