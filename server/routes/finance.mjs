import express from 'express'
import debug from 'debug'

import config from '#config'

const log = debug('api:finance')

const router = express.Router()

/**
 * Proxy route for finance API.
 * Forwards GET requests from base client to the finance API service,
 * avoiding CORS issues since both services share the same network.
 *
 * Mounted at /api/proxy/finance in the main server.
 * Forwards to: config.finance.api_url + /api/<remainder>
 */
router.use(async (req, res) => {
  const finance_config = config.finance || {}
  const api_url = finance_config.api_url

  if (!api_url) {
    return res.status(503).json({
      error: 'Finance API not configured',
      message: 'Set finance.api_url in config'
    })
  }

  // req.url contains the path after the mount point (/api/proxy/finance)
  const target_url = `${api_url}/api${req.url}`

  log(`Proxying ${req.method} ${req.url} -> ${target_url}`)

  try {
    const headers = {}

    // Forward auth-related headers
    if (req.headers['x-public-key']) {
      headers['x-public-key'] = req.headers['x-public-key']
    }

    const has_body = req.method !== 'GET' && req.method !== 'HEAD' && req.body
    if (has_body) {
      headers['Content-Type'] = 'application/json'
    }

    const response = await fetch(target_url, {
      method: req.method,
      headers,
      ...(has_body && { body: JSON.stringify(req.body) }),
      signal: AbortSignal.timeout(30000)
    })

    const data = await response.json()
    res.status(response.status).json(data)
  } catch (error) {
    log(`Finance proxy error: ${error.message}`)

    const is_connection_error =
      error.cause?.code === 'ECONNREFUSED' ||
      error.message.includes('ECONNREFUSED')

    if (is_connection_error) {
      res.status(503).json({
        error: 'Finance API unavailable',
        message: 'The finance API service is not running'
      })
    } else if (error.name === 'TimeoutError') {
      res.status(504).json({
        error: 'Finance API timeout',
        message: 'The finance API took too long to respond'
      })
    } else {
      res.status(500).json({
        error: 'Finance proxy error',
        message: error.message
      })
    }
  }
})

export default router
