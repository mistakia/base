/**
 * OpenAI Session Provider
 *
 * Implementation of SessionProviderBase for OpenAI conversations.
 * Uses helper functions to keep class focused and maintainable.
 */

import { SessionProviderBase } from '#libs-server/integrations/thread/session-provider-base.mjs'
import { normalize_openai_conversation } from '#libs-server/integrations/openai/normalize-session.mjs'
import {
  find_openai_sessions_from_data,
  find_openai_sessions_from_api,
  validate_openai_session_structure,
  extract_openai_models_from_session,
  get_openai_inference_provider,
  get_openai_session_id,
  build_openai_timeline_entries,
  generate_openai_thread_id,
  generate_openai_thread_metadata
} from './openai-session-helpers.mjs'

export class OpenAISessionProvider extends SessionProviderBase {
  constructor() {
    super({ provider_name: 'openai' })
  }

  /**
   * Find OpenAI conversations from provided data or API
   * If openai_conversations are provided, use them directly.
   * Otherwise, discover conversations from OpenAI API.
   */
  async find_sessions({
    openai_conversations = [],
    auth_options,
    max_conversations
  } = {}) {
    // If conversations are provided directly, use them
    if (openai_conversations.length > 0) {
      return await find_openai_sessions_from_data({
        conversations: openai_conversations
      })
    }

    // Otherwise discover from API
    return await find_openai_sessions_from_api({
      auth_options,
      max_conversations
    })
  }

  /**
   * Normalize OpenAI conversation to common format
   */
  normalize_session(raw_session) {
    return normalize_openai_conversation(raw_session)
  }

  /**
   * Validate OpenAI conversation structure
   */
  validate_session(raw_session) {
    return validate_openai_session_structure({ session: raw_session })
  }

  /**
   * Get inference provider name for OpenAI
   */
  get_inference_provider() {
    return get_openai_inference_provider()
  }

  /**
   * Extract models from OpenAI conversation metadata
   */
  get_models_from_session(raw_session) {
    return extract_openai_models_from_session({ raw_session })
  }

  /**
   * Get session ID from OpenAI conversation
   */
  get_session_id(raw_session) {
    return get_openai_session_id({ raw_session })
  }

  /**
   * Build timeline entries from OpenAI messages
   */
  build_timeline_entries({ messages }) {
    return build_openai_timeline_entries({ messages })
  }

  /**
   * Generate thread ID for OpenAI session
   */
  async generate_thread_id(raw_session) {
    const session_id = this.get_session_id(raw_session)
    return generate_openai_thread_id({ session_id })
  }

  /**
   * Generate thread metadata for OpenAI conversation
   */
  generate_thread_metadata({ conversation }) {
    return generate_openai_thread_metadata({ conversation })
  }
}
