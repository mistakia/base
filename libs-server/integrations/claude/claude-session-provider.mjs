/**
 * Claude Session Provider
 *
 * Implementation of SessionProviderBase for Claude/Anthropic sessions.
 * Uses helper functions to keep class focused and maintainable.
 */

import { SessionProviderBase } from '#libs-server/integrations/thread/session-provider-base.mjs'
import { normalize_claude_session } from '#libs-server/integrations/claude/normalize-session.mjs'
import {
  find_claude_sessions_from_data,
  find_claude_sessions_from_filesystem,
  validate_claude_session_structure,
  extract_claude_models_from_session,
  get_claude_inference_provider,
  get_claude_session_id
} from './claude-session-helpers.mjs'
import { get_claude_config } from './claude-config.mjs'

export class ClaudeSessionProvider extends SessionProviderBase {
  constructor() {
    super({ provider_name: 'claude' })
  }

  /**
   * Find Claude sessions from provided data or filesystem
   * If claude_sessions are provided, use them directly.
   * Otherwise, discover sessions from Claude projects directory.
   */
  async find_sessions({
    claude_sessions = [],
    claude_projects_directory,
    filter_sessions
  } = {}) {
    // If sessions are provided directly, use them
    if (claude_sessions.length > 0) {
      return await find_claude_sessions_from_data({ sessions: claude_sessions })
    }

    // Otherwise discover from filesystem
    const config = get_claude_config({ claude_projects_directory })
    return await find_claude_sessions_from_filesystem({
      claude_projects_directory: config.claude_projects_directory,
      filter_sessions
    })
  }

  /**
   * Normalize Claude session to common format
   */
  normalize_session(raw_session) {
    return normalize_claude_session(raw_session)
  }

  /**
   * Validate Claude session structure
   */
  validate_session(raw_session) {
    return validate_claude_session_structure({ session: raw_session })
  }

  /**
   * Get inference provider name for Claude
   */
  get_inference_provider() {
    return get_claude_inference_provider()
  }

  /**
   * Extract models from Claude session metadata
   */
  async get_models_from_session(raw_session) {
    return await extract_claude_models_from_session({ raw_session })
  }

  /**
   * Get session ID from Claude session
   */
  get_session_id(raw_session) {
    return get_claude_session_id({ raw_session })
  }
}
