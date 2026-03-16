import debug from 'debug'

const log = debug('base:api-error')

/**
 * Send a standardized JSON error response.
 *
 * @param {Object} res - Express response object
 * @param {Object} params - Error parameters
 * @param {number} [params.status=500] - HTTP status code
 * @param {string} params.error - Short machine-readable error string
 * @param {string} [params.message] - Human-readable detail
 * @param {Object} [params.details] - Additional context fields merged into response
 */
export function send_error_response(
  res,
  { status = 500, error, message, details }
) {
  const body = { error }
  if (message) body.message = message
  if (details) Object.assign(body, details)

  res.status(status).json(body)
}

/**
 * Convenience wrapper matching the existing handle_errors pattern
 * used in threads.mjs and models.mjs routes.
 *
 * @param {Object} res - Express response object
 * @param {Error} error - The caught error
 * @param {string} operation - Description of what failed (e.g., 'listing threads')
 */
export function handle_errors(res, error, operation) {
  log(`Error ${operation}: ${error.message}`)
  send_error_response(res, {
    status: 500,
    error: `Failed to ${operation}`,
    message: error.message
  })
}
