import debug from 'debug'
import { verify_service_token } from '#libs-server/threads/lease-auth.mjs'

const log = debug('api:require-service-auth')

const require_service_auth = (req, res, next) => {
  const auth_header = req.headers.authorization
  if (!auth_header || !auth_header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'service authentication required' })
  }
  const token = auth_header.slice('Bearer '.length)
  try {
    const claims = verify_service_token({ token })
    req.service = { machine_id: claims.machine_id, scope: claims.scope }
    next()
  } catch (error) {
    log(`service token verification failed: ${error.message}`)
    return res.status(401).json({ error: 'invalid service token' })
  }
}

export default require_service_auth
