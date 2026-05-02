/**
 * Base SessionProvider Class
 *
 * Abstract base class for session providers that create threads from external sessions.
 * Each provider (Claude, Cursor, ChatGPT, etc.) extends this class to implement
 * provider-specific logic while maintaining a consistent interface.
 */

import debug from 'debug'

import { generate_thread_id_from_session } from '#libs-server/threads/generate-thread-id-from-session.mjs'
import { calculate_session_counts } from './session-count-utilities.mjs'

export class SessionProviderBase {
  constructor({ provider_name }) {
    if (!provider_name) {
      throw new Error('provider_name is required')
    }

    this.provider_name = provider_name
    this.log = debug(`integrations:thread:session-provider:${provider_name}`)

    // Ensure this is not instantiated directly
    if (this.constructor === SessionProviderBase) {
      throw new Error(
        'SessionProviderBase is an abstract class and cannot be instantiated directly'
      )
    }
  }

  /**
   * Provider name identifier
   */
  get name() {
    return this.provider_name
  }

  /**
   * Whether this provider produces raw session data that should be persisted
   * to the thread's raw-data/ directory. Override to false for providers
   * (like Pi) that have no raw-data persister yet.
   */
  get supports_raw_data() {
    return true
  }

  /**
   * Find sessions from provider-specific source
   * Must be implemented by subclasses
   *
   * @param {Object} options - Provider-specific options for finding sessions
   * @returns {Promise<Array>} Array of raw session objects
   */
  async find_sessions(options = {}) {
    throw new Error(
      `find_sessions must be implemented by ${this.constructor.name}`
    )
  }

  /**
   * Stream sessions one at a time from provider-specific source.
   * Default implementation calls find_sessions() and yields each session.
   * Override in subclasses to implement true streaming for memory efficiency.
   *
   * @param {Object} options - Provider-specific options for finding sessions
   * @yields {Object} Raw session objects one at a time
   */
  async *stream_sessions(options = {}) {
    this.log(
      'Using default stream_sessions (find_sessions fallback). Override for true streaming.'
    )

    const sessions = await this.find_sessions(options)

    for (const session of sessions) {
      yield session
    }
  }

  /**
   * Normalize a single raw session to common format
   * Must be implemented by subclasses
   *
   * @param {Object} raw_session - Raw session data from provider
   * @returns {Object} Normalized session object
   */
  normalize_session(raw_session) {
    throw new Error(
      `normalize_session must be implemented by ${this.constructor.name}`
    )
  }

  /**
   * Validate a raw session object
   * Must be implemented by subclasses
   *
   * @param {Object} raw_session - Raw session data to validate
   * @returns {Object} { valid: boolean, errors: string[] }
   */
  validate_session(raw_session) {
    throw new Error(
      `validate_session must be implemented by ${this.constructor.name}`
    )
  }

  /**
   * Get inference provider name for this session provider
   * Must be implemented by subclasses
   *
   * @returns {string} Inference provider name (e.g., 'anthropic', 'chatgpt')
   */
  get_inference_provider() {
    throw new Error(
      `get_inference_provider must be implemented by ${this.constructor.name}`
    )
  }

  /**
   * Extract models from raw session
   * Must be implemented by subclasses
   *
   * @param {Object} raw_session - Raw session data
   * @returns {Array} Array of model identifiers
   */
  get_models_from_session(raw_session) {
    throw new Error(
      `get_models_from_session must be implemented by ${this.constructor.name}`
    )
  }

  /**
   * Generate thread metadata for session
   * Optional method - can be overridden by subclasses for provider-specific metadata
   *
   * @param {Object} params - Parameters object
   * @param {Object} params.conversation - Raw conversation/session data
   * @param {Object} params.additional_metadata - Additional metadata to include (optional)
   * @returns {Object} Thread metadata object
   */
  generate_thread_metadata({ conversation, additional_metadata = {} }) {
    const counts = calculate_session_counts(conversation.messages || [])
    const session_id = this.get_session_id(conversation)

    return {
      provider: this.provider_name,
      session_id,
      message_count: counts.message_count,
      tool_call_count: counts.tool_call_count,
      created_at: conversation.created_at || new Date().toISOString(),
      updated_at: conversation.updated_at || new Date().toISOString(),
      ...additional_metadata
    }
  }

  /**
   * Filter sessions to only include valid ones
   * Default implementation uses validate_session - can be overridden
   *
   * @param {Array} raw_sessions - Array of raw session objects
   * @returns {Object} { valid: Array, invalid: Array }
   */
  filter_valid_sessions(raw_sessions) {
    const valid_sessions = []
    const invalid_sessions = []

    for (const session of raw_sessions) {
      const validation = this.validate_session(session)
      if (validation.valid) {
        valid_sessions.push(session)
      } else {
        invalid_sessions.push({
          session_id: session.session_id || 'unknown',
          errors: validation.errors
        })
      }
    }

    if (invalid_sessions.length > 0) {
      this.log(`Found ${invalid_sessions.length} invalid sessions:`)
      invalid_sessions.forEach(({ session_id, errors }) => {
        this.log(`  Session ${session_id}: ${errors.join(', ')}`)
      })
    }

    return {
      valid: valid_sessions,
      invalid: invalid_sessions,
      total: raw_sessions.length
    }
  }

  /**
   * Get session ID from raw session
   * Default implementation - can be overridden if needed
   *
   * @param {Object} raw_session - Raw session data
   * @returns {string} Session identifier
   */
  get_session_id(raw_session) {
    return raw_session.session_id || raw_session.id
  }

  /**
   * Generate thread ID for session
   * Default implementation - can be overridden for provider-specific logic
   *
   * @param {Object} raw_session - Raw session data
   * @returns {Promise<string>} Thread identifier
   */
  async generate_thread_id(raw_session) {
    return generate_thread_id_from_session({
      session_id: this.get_session_id(raw_session),
      session_provider: this.provider_name
    })
  }
}
