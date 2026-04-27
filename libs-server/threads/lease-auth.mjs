import jwt from 'jsonwebtoken'
import debug from 'debug'
import config from '#config'

const log = debug('threads:lease-auth')

const TOKEN_AUDIENCE = 'lease-api'
const TOKEN_SCOPE = 'lease'
const DEFAULT_TTL_SECONDS = 90
const EARLY_EXPIRY_BUFFER_SECONDS = 15

export class ServiceTokenSecretMissing extends Error {
  constructor() {
    super(
      'config.service_token.secret is not set; cannot mint service tokens'
    )
    this.name = 'ServiceTokenSecretMissing'
  }
}

const _resolve_secret = () => {
  const secret = config.service_token?.secret
  if (!secret) throw new ServiceTokenSecretMissing()
  return secret
}

export const mint_service_token = ({
  machine_id,
  ttl_seconds = DEFAULT_TTL_SECONDS
}) => {
  if (!machine_id) throw new Error('mint_service_token: machine_id required')
  const secret = _resolve_secret()
  return jwt.sign(
    {
      sub: `service:${machine_id}`,
      iss: machine_id,
      aud: TOKEN_AUDIENCE,
      scope: TOKEN_SCOPE
    },
    secret,
    { algorithm: 'HS256', expiresIn: ttl_seconds }
  )
}

export const verify_service_token = ({ token }) => {
  const secret = _resolve_secret()
  const decoded = jwt.verify(token, secret, {
    algorithms: ['HS256'],
    audience: TOKEN_AUDIENCE
  })
  if (decoded.scope !== TOKEN_SCOPE) {
    const err = new Error('service token missing lease scope')
    err.name = 'JsonWebTokenError'
    throw err
  }
  if (typeof decoded.sub !== 'string' || !decoded.sub.startsWith('service:')) {
    const err = new Error('service token sub must be service:<machine_id>')
    err.name = 'JsonWebTokenError'
    throw err
  }
  return {
    machine_id: decoded.sub.slice('service:'.length),
    scope: decoded.scope,
    iat: decoded.iat,
    exp: decoded.exp
  }
}

let _cached = null

export const get_service_token = ({ machine_id, ttl_seconds } = {}) => {
  const now_seconds = Math.floor(Date.now() / 1000)
  if (
    _cached &&
    _cached.machine_id === machine_id &&
    _cached.expires_at - EARLY_EXPIRY_BUFFER_SECONDS > now_seconds
  ) {
    return _cached.token
  }
  const ttl = ttl_seconds ?? DEFAULT_TTL_SECONDS
  const token = mint_service_token({ machine_id, ttl_seconds: ttl })
  _cached = {
    token,
    machine_id,
    expires_at: now_seconds + ttl
  }
  log(`minted service token for ${machine_id} (ttl=${ttl}s)`)
  return token
}

export const _reset_cache_for_tests = () => {
  _cached = null
}
