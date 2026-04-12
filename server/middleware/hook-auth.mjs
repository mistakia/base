import crypto from 'crypto'
import config from '#config'

/**
 * Express middleware: require localhost or valid API key.
 * Used by hook endpoints (active-sessions, thread session-status).
 */
const require_hook_auth = (req, res, next) => {
  const expected_key = config.job_tracker?.api_key
  const auth_header = req.headers.authorization
  const is_localhost = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.ip)
  if (!is_localhost) {
    if (!expected_key || !auth_header) {
      return res.status(401).json({ error: 'Authentication required' })
    }
    const provided_key = auth_header.replace(/^Bearer\s+/i, '')
    const provided_buf = Buffer.from(provided_key)
    const expected_buf = Buffer.from(expected_key)
    if (
      provided_buf.length !== expected_buf.length ||
      !crypto.timingSafeEqual(provided_buf, expected_buf)
    ) {
      return res.status(401).json({ error: 'Invalid API key' })
    }
  }
  next()
}

export default require_hook_auth
