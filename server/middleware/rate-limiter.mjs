/**
 * Rate Limiter Middleware Factory
 *
 * Creates rate limiting middleware for different endpoint tiers.
 * Uses express-rate-limit for request throttling.
 */

import rateLimit from 'express-rate-limit'
import debug from 'debug'

const log = debug('api:rate-limiter')

const IS_TEST = process.env.NODE_ENV === 'test'

/**
 * Create a rate limit handler that logs the exceeded limit
 * @param {string} category - Category name for logging
 * @returns {Function} Handler function
 */
const create_rate_limit_handler = (category) => (req, res, next, options) => {
  log(`${category} rate limit exceeded for IP: ${req.ip}, path: ${req.path}`)
  res.status(options.statusCode).json(options.message)
}

/**
 * Create a rate limiter for authentication endpoints
 * More restrictive to prevent brute force attacks
 * @returns {Function} Express middleware
 */
export function create_auth_limiter() {
  return rateLimit({
    windowMs: 60 * 1000, // 1 minute window
    max: 10, // 10 requests per minute
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => IS_TEST || req.user,
    message: {
      error: 'Too many authentication requests',
      message: 'Please try again after a minute'
    },
    handler: create_rate_limit_handler('Auth')
  })
}

/**
 * Create a rate limiter for write operations (POST, PUT, DELETE)
 * @returns {Function} Express middleware
 */
export function create_write_limiter() {
  return rateLimit({
    windowMs: 60 * 1000, // 1 minute window
    max: 60, // 60 requests per minute
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => IS_TEST || req.user,
    message: {
      error: 'Too many write requests',
      message: 'Please slow down your requests'
    },
    handler: create_rate_limit_handler('Write')
  })
}

/**
 * Create a rate limiter for read operations (GET)
 * Most permissive tier
 * @returns {Function} Express middleware
 */
export function create_read_limiter() {
  return rateLimit({
    windowMs: 60 * 1000, // 1 minute window
    max: 1000, // 1000 requests per minute
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => IS_TEST || req.user,
    message: {
      error: 'Too many read requests',
      message: 'Please slow down your requests'
    },
    handler: create_rate_limit_handler('Read')
  })
}

/**
 * Create a rate limiter for search endpoints
 * More restrictive than read to prevent abuse
 * @returns {Function} Express middleware
 */
export function create_search_limiter() {
  return rateLimit({
    windowMs: 60 * 1000, // 1 minute window
    max: 30, // 30 requests per minute
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => IS_TEST || req.user,
    message: {
      error: 'Too many search requests',
      message: 'Please slow down your search queries'
    },
    handler: create_rate_limit_handler('Search')
  })
}
