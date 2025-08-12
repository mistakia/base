/**
 * Claude Session Helper Functions
 *
 * Focused helper functions for Claude session processing.
 * Keeps provider class small while handling specific operations.
 */

import debug from 'debug'
import { parse_all_claude_files } from './parse-jsonl.mjs'
import { normalize_claude_session } from './normalize-session.mjs'

const log = debug('integrations:claude:session-helpers')

/**
 * Find Claude sessions from provided data
 * Note: Claude sessions come from JSONL files and must be provided directly
 *
 * @param {Object} params - Parameters object
 * @param {Array} params.sessions - Array of Claude sessions
 * @returns {Promise<Array>} Array of raw Claude session objects
 */
export const find_claude_sessions_from_data = async ({ sessions = [] }) => {
  log(`Processing ${sessions.length} provided Claude sessions`)
  return sessions
}

/**
 * Find Claude sessions from filesystem (JSONL files)
 *
 * @param {Object} params - Parameters object
 * @param {string} params.claude_projects_directory - Claude projects directory path
 * @param {Function} params.filter_sessions - Optional filter function
 * @returns {Promise<Array>} Array of raw Claude session objects
 */
export const find_claude_sessions_from_filesystem = async ({
  claude_projects_directory,
  filter_sessions = null
}) => {
  log(`Finding Claude sessions from filesystem: ${claude_projects_directory}`)
  const sessions = await parse_all_claude_files({
    claude_projects_directory,
    filter_sessions
  })

  log(`Found ${sessions.length} Claude sessions from filesystem`)
  return sessions
}

/**
 * Validate Claude session structure
 *
 * @param {Object} params - Parameters object
 * @param {Object} params.session - Raw Claude session data
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export const validate_claude_session_structure = ({ session }) => {
  const errors = []

  if (!session.session_id) {
    errors.push('Missing session_id')
  }

  if (
    !session.entries ||
    !Array.isArray(session.entries) ||
    session.entries.length === 0
  ) {
    errors.push('Missing or invalid entries array')
  }

  if (!session.metadata) {
    errors.push('Missing metadata')
  }

  if (session.entries) {
    const required_fields = ['uuid', 'timestamp', 'type']
    session.entries.forEach((entry, index) => {
      required_fields.forEach((field) => {
        if (!entry[field]) {
          errors.push(`Entry ${index} missing required field: ${field}`)
        }
      })
    })
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Extract models from Claude session metadata
 *
 * @param {Object} params - Parameters object
 * @param {Object} params.raw_session - Raw Claude session data
 * @param {Object} params.normalized_session - Normalized session (optional, will normalize if not provided)
 * @returns {Array} Array of model identifiers
 */
export const extract_claude_models_from_session = async ({
  raw_session,
  normalized_session = null
}) => {
  // Use provided normalized session or normalize on demand
  let session_to_check = normalized_session
  if (!session_to_check) {
    session_to_check = normalize_claude_session(raw_session)
  }

  return session_to_check.metadata.models || []
}

/**
 * Get inference provider name for Claude sessions
 *
 * @returns {string} Anthropic inference provider name
 */
export const get_claude_inference_provider = () => {
  return 'anthropic'
}

/**
 * Get session ID from Claude session
 *
 * @param {Object} params - Parameters object
 * @param {Object} params.raw_session - Raw Claude session data
 * @returns {string} Session identifier
 */
export const get_claude_session_id = ({ raw_session }) => {
  return raw_session.session_id || raw_session.id
}

/**
 * Filter valid Claude sessions from array
 *
 * @param {Object} params - Parameters object
 * @param {Array} params.sessions - Array of raw Claude sessions
 * @returns {Object} { valid: Array, invalid: Array, total: number }
 */
export const filter_valid_claude_sessions = ({ sessions }) => {
  const valid_sessions = []
  const invalid_sessions = []

  sessions.forEach((session) => {
    const validation = validate_claude_session_structure({ session })
    if (validation.valid) {
      valid_sessions.push(session)
    } else {
      invalid_sessions.push({
        session_id: session.session_id || 'unknown',
        errors: validation.errors
      })
    }
  })

  if (invalid_sessions.length > 0) {
    log(`Found ${invalid_sessions.length} invalid Claude sessions:`)
    invalid_sessions.forEach(({ session_id, errors }) => {
      log(`  Session ${session_id}: ${errors.join(', ')}`)
    })
  }

  return {
    valid: valid_sessions,
    invalid: invalid_sessions,
    total: sessions.length
  }
}
