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
  get_claude_session_id,
  scan_claude_agent_relationships,
  group_sessions_with_agents
} from './claude-session-helpers.mjs'
import { get_claude_config } from './claude-config.mjs'
import { stream_claude_sessions } from './parse-jsonl.mjs'

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
    filter_sessions,
    session_id,
    session_file
  } = {}) {
    // If sessions are provided directly, use them
    if (claude_sessions.length > 0) {
      return await find_claude_sessions_from_data({ sessions: claude_sessions })
    }

    // If session_file or session_id is specified but no sessions provided,
    // only scan the specified file/session, don't fall back to scanning all files
    if (session_file || session_id) {
      const config = get_claude_config({ claude_projects_directory })
      return await find_claude_sessions_from_filesystem({
        claude_projects_directory: config.claude_projects_directory,
        filter_sessions,
        session_id,
        session_file
      })
    }

    // Otherwise discover from filesystem (all files)
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

  /**
   * Stream Claude sessions one at a time with agent merging.
   * For single session lookups (session_id, session_file), uses direct load.
   * For bulk imports, builds agent index first then streams efficiently.
   *
   * @param {Object} options - Options for streaming sessions
   * @param {string} options.claude_projects_directory - Claude projects directory
   * @param {Function} options.filter_sessions - Optional filter function
   * @param {string} options.session_id - Specific session ID to load
   * @param {string} options.session_file - Specific session file to load
   * @param {boolean} options.include_warm_agents - Include warm agents (default: false)
   * @yields {Object} Session objects one at a time
   */
  async *stream_sessions({
    claude_projects_directory,
    filter_sessions,
    session_id,
    session_file,
    include_warm_agents = false,
    from_date = null,
    to_date = null
  } = {}) {
    const config = get_claude_config({ claude_projects_directory })

    // For single session lookups, use existing find_sessions (already optimized)
    // Then group agents with their parents to avoid yielding agents as standalone sessions
    if (session_file || session_id) {
      this.log(`Loading single session: ${session_id || session_file}`)
      const sessions = await this.find_sessions({
        claude_projects_directory: config.claude_projects_directory,
        filter_sessions,
        session_id,
        session_file
      })

      // Group agents with their parent sessions
      const { grouped, standalone_sessions, orphan_agents } =
        group_sessions_with_agents({
          sessions,
          include_warm_agents
        })

      // Yield standalone sessions (parents with no agents)
      for (const session of standalone_sessions) {
        yield session
      }

      // Yield grouped sessions (parents with agent_sessions attached)
      for (const [, { parent_session, agent_sessions }] of grouped) {
        parent_session.agent_sessions = agent_sessions
        yield parent_session
      }

      // Log orphan agents but don't yield them
      if (orphan_agents.length > 0) {
        this.log(
          `Skipping ${orphan_agents.length} orphan agent sessions without parent in batch`
        )
      }

      return
    }

    // For bulk imports: use streaming with agent index
    this.log('Building agent relationship index for streaming...')
    const agent_index = await scan_claude_agent_relationships({
      claude_projects_directory: config.claude_projects_directory
    })

    this.log('Streaming sessions with agent merging...')
    yield* stream_claude_sessions({
      agent_index,
      filter_session: filter_sessions,
      include_warm_agents,
      from_date,
      to_date
    })
  }
}
