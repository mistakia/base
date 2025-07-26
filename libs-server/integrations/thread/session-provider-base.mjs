/**
 * Base SessionProvider Class
 *
 * Abstract base class for session providers that create threads from external sessions.
 * Each provider (Claude, Cursor, OpenAI, etc.) extends this class to implement
 * provider-specific logic while maintaining a consistent interface.
 */

import debug from 'debug'
import { generate_thread_id_from_session } from '#libs-server/threads/create-thread.mjs'

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
   * @returns {string} Inference provider name (e.g., 'anthropic', 'openai')
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
   * Build timeline entries from session messages
   * Optional method - can be overridden by subclasses that need custom timeline building
   *
   * @param {Object} params - Parameters object
   * @param {Array} params.messages - Array of session messages
   * @param {Object} params.session_metadata - Session metadata (optional)
   * @returns {Array} Array of timeline entries
   */
  build_timeline_entries({ messages, session_metadata = {} }) {
    // Default implementation - subclasses can override for provider-specific logic
    return messages.map((message, index) => ({
      id: message.id || `msg_${index}`,
      timestamp: message.timestamp || new Date().toISOString(),
      type: 'message',
      provider: this.provider_name,
      data: {
        role: message.role || 'unknown',
        content: message.content || '',
        ...message
      }
    }))
  }

  /**
   * Create a single thread from raw session
   * Optional method - provides default implementation using common thread creation
   *
   * @param {Object} params - Parameters object
   * @param {Object} params.raw_session - Raw session data
   * @param {Object} params.options - Thread creation options
   * @returns {Promise<Object>} Thread creation result
   */
  async create_single_thread({ raw_session, options = {} }) {
    // Import here to avoid circular dependencies
    const { create_thread_from_session } = await import(
      './create-from-session.mjs'
    )
    const { build_timeline_from_session } = await import(
      './build-timeline-entries.mjs'
    )

    // Normalize session just-in-time
    const normalized_session = this.normalize_session(raw_session)

    // Create thread with direct access to raw data
    const models = await this.get_models_from_session(raw_session)
    const thread_result = await create_thread_from_session({
      normalized_session,
      inference_provider: this.get_inference_provider(),
      models,
      raw_session_data: raw_session,
      ...options
    })

    // Build timeline entries
    const timeline_result = await build_timeline_from_session(
      normalized_session,
      thread_result
    )

    return {
      thread_id: thread_result.thread_id,
      thread_dir: thread_result.thread_dir,
      session_id: this.get_session_id(raw_session),
      timeline_entries: timeline_result.entry_count,
      metadata: thread_result.metadata,
      timeline_path: timeline_result.timeline_path,
      normalized_session
    }
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
    const message_count = conversation.messages?.length || 0
    const session_id = this.get_session_id(conversation)

    return {
      provider: this.provider_name,
      session_id,
      message_count,
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

  /**
   * Log provider-specific message
   *
   * @param {string} message - Message to log
   */
  log_message(message) {
    this.log(message)
  }
}
