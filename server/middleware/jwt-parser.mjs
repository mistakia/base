import jwt from 'jsonwebtoken'
import debug from 'debug'
import config from '#config'

const log = debug('api:jwt-parser')

/**
 * Middleware to parse JWT tokens and set req.user without blocking requests
 * This allows routes to handle both authenticated and unauthenticated requests
 * Checks Authorization header first, falls back to base_token cookie
 */
export const parse_jwt_token = () => {
  return async (req, res, next) => {
    const auth_header = req.headers.authorization
    let token = null

    // Check Authorization header first, fall back to cookie
    if (auth_header && auth_header.startsWith('Bearer ')) {
      token = auth_header.replace('Bearer ', '')
    } else if (req.cookies?.base_token) {
      token = req.cookies.base_token
    }

    if (!token) {
      req.user = null
      return next()
    }

    try {
      const decoded = jwt.verify(token, config.jwt.secret)
      req.user = {
        user_public_key: decoded.user_public_key,
        ...decoded
      }
      log(`JWT token validated for user: ${decoded.user_public_key}`)
    } catch (error) {
      log(`JWT verification failed: ${error.message}`)
      req.user = null
    }

    next()
  }
}
