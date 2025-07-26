/**
 * Cursor Session Helper Functions
 *
 * Focused helper functions for Cursor session processing.
 * Keeps provider class small while handling specific operations.
 */

import debug from 'debug'
import { v5 as uuidv5 } from 'uuid'
import { CURSOR_THREAD_NAMESPACE } from './cursor-config.mjs'

const log = debug('integrations:cursor:session-helpers')

/**
 * Find Cursor conversations from provided data
 * Note: Cursor conversations come from database and must be provided directly
 *
 * @param {Object} params - Parameters object
 * @param {Array} params.conversations - Array of Cursor conversations
 * @returns {Promise<Array>} Array of raw Cursor conversation objects
 */
export const find_cursor_sessions_from_data = async ({
  conversations = []
}) => {
  log(`Processing ${conversations.length} provided Cursor conversations`)
  return conversations
}

/**
 * Find Cursor conversations from database
 *
 * @param {Object} params - Parameters object
 * @param {string} params.cursor_data_path - Path to Cursor database
 * @param {Function} params.filter_conversations - Optional filter function
 * @returns {Promise<Array>} Array of raw Cursor conversation objects
 */
export const find_cursor_sessions_from_database = async ({
  cursor_data_path,
  filter_conversations = null
}) => {
  const { read_all_cursor_conversations } = await import('./read-database.mjs')

  log(`Finding Cursor conversations from database: ${cursor_data_path}`)
  const conversations = await read_all_cursor_conversations({
    db_path: cursor_data_path,
    filter_conversations
  })

  log(`Found ${conversations.length} Cursor conversations from database`)
  return conversations
}

/**
 * Validate Cursor conversation structure
 *
 * @param {Object} params - Parameters object
 * @param {Object} params.session - Raw Cursor conversation data
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export const validate_cursor_session_structure = ({ session }) => {
  const errors = []

  // Required fields
  if (!session.composer_id) {
    errors.push('Missing composer_id')
  }

  if (!session.messages || !Array.isArray(session.messages)) {
    errors.push('Missing or invalid messages array')
  } else if (session.messages.length === 0) {
    errors.push('No messages in conversation')
  }

  // Validate message structure for first few messages
  if (session.messages) {
    for (let i = 0; i < Math.min(session.messages.length, 5); i++) {
      const msg = session.messages[i]
      if (!msg.id) {
        errors.push(`Message ${i} missing id`)
      }
      if (!msg.role) {
        errors.push(`Message ${i} missing role`)
      }
      if (!msg.content && !msg.content_parts) {
        errors.push(`Message ${i} has no content`)
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Generate deterministic thread ID from Cursor composer ID
 *
 * @param {Object} params - Parameters object
 * @param {string} params.composer_id - Cursor composer ID
 * @returns {string} Deterministic thread ID
 */
export const generate_cursor_thread_id = ({ composer_id }) => {
  return uuidv5(`cursor:${composer_id}`, CURSOR_THREAD_NAMESPACE)
}

/**
 * Get inference provider name for Cursor sessions
 * Note: Cursor uses various providers - could be enhanced to detect from conversation
 *
 * @returns {string} Generic inference provider name
 */
export const get_cursor_inference_provider = () => {
  return 'cursor'
}

/**
 * Extract models from Cursor conversation
 * Note: Cursor model information might be embedded in messages or metadata
 *
 * @param {Object} params - Parameters object
 * @param {Object} params.raw_session - Raw Cursor conversation data
 * @returns {Array} Array of model identifiers
 */
export const extract_cursor_models_from_session = ({ raw_session }) => {
  // Cursor conversations might not have explicit model information
  // This could be enhanced to extract from message metadata
  return []
}

/**
 * Get session ID from Cursor conversation
 * Cursor uses composer_id as the session identifier
 *
 * @param {Object} params - Parameters object
 * @param {Object} params.raw_session - Raw Cursor conversation data
 * @returns {string} Session identifier
 */
export const get_cursor_session_id = ({ raw_session }) => {
  return raw_session.composer_id
}

/**
 * Filter valid Cursor conversations from array
 *
 * @param {Object} params - Parameters object
 * @param {Array} params.sessions - Array of raw Cursor conversations
 * @returns {Object} { valid: Array, invalid: Array, total: number }
 */
export const filter_valid_cursor_sessions = ({ sessions }) => {
  const valid_sessions = []
  const invalid_sessions = []

  sessions.forEach((session) => {
    const validation = validate_cursor_session_structure({ session })
    if (validation.valid) {
      valid_sessions.push(session)
    } else {
      invalid_sessions.push({
        session_id: get_cursor_session_id({ raw_session: session }),
        errors: validation.errors
      })
    }
  })

  if (invalid_sessions.length > 0) {
    log(`Found ${invalid_sessions.length} invalid Cursor conversations:`)
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
