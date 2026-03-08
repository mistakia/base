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
    let source = null

    // Check Authorization header first
    if (auth_header && auth_header.startsWith('Bearer ')) {
      token = auth_header.replace('Bearer ', '')
      source = 'header'
    } else if (req.cookies?.base_token) {
      // Fall back to cookie
      token = req.cookies.base_token
      source = 'cookie'
    }

    if (!token) {
      log('No token found in header or cookie, proceeding without user')
      req.user = null
      return next()
    }

    try {
      // Verify and decode the token
      const decoded = jwt.verify(token, config.jwt.secret)

      // Set req.user with the decoded token data
      req.user = {
        user_public_key: decoded.user_public_key,
        ...decoded
      }

      log(
        `JWT token validated for user: ${decoded.user_public_key} (source: ${source})`
      )
    } catch (error) {
      // Log the error but don't block the request
      log(`JWT verification failed (source: ${source}): ${error.message}`)
      req.user = null
    }

    next()
  }
}
