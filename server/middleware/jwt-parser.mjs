import jwt from 'jsonwebtoken'
import debug from 'debug'
import config from '#config'

const log = debug('api:jwt-parser')

/**
 * Middleware to parse JWT tokens and set req.user without blocking requests
 * This allows routes to handle both authenticated and unauthenticated requests
 */
export const parse_jwt_token = () => {
  return async (req, res, next) => {
    // Extract token from Authorization header
    const auth_header = req.headers.authorization

    if (!auth_header || !auth_header.startsWith('Bearer ')) {
      log('No valid Authorization header found, proceeding without user')
      req.user = null
      return next()
    }

    const token = auth_header.replace('Bearer ', '')

    try {
      // Verify and decode the token
      const decoded = jwt.verify(token, config.jwt.secret)

      // Set req.user with the decoded token data
      req.user = {
        user_public_key: decoded.user_public_key,
        ...decoded
      }

      log(`JWT token validated for user: ${decoded.user_public_key}`)
    } catch (error) {
      // Log the error but don't block the request
      log(`JWT verification failed: ${error.message}`)
      req.user = null
    }

    next()
  }
}
