/**
 * Claude Session Helper Functions
 *
 * Focused helper functions for Claude session processing.
 * Keeps provider class small while handling specific operations.
 */

import debug from 'debug'
import path from 'path'
import { stat as fs_stat } from 'fs/promises'

import {
  parse_all_claude_files,
  parse_session_with_subagents,
  parse_claude_jsonl_from_offset,
  parse_claude_jsonl_file,
  find_session_file_by_id,
  find_claude_project_files,
  find_subagent_session_files,
  extract_claude_session_metadata
} from './parse-jsonl.mjs'
import {
  load_sync_state,
  save_sync_state,
  update_sync_counts,
  build_initial_sync_state
} from './sync-state.mjs'
import { normalize_claude_session } from './normalize-session.mjs'
import { CLAUDE_DEFAULT_PATHS } from './claude-config.mjs'

const log = debug('integrations:claude:session-helpers')
const log_debug = debug('integrations:claude:session-helpers:debug')
const log_perf = debug('integrations:claude:perf')

/**
 * Check if a file path represents an agent session based on path structure.
 * Agent sessions are in 'subagents' directories or have 'agent-' filename prefix.
 *
 * @param {string} file_path - Path to session file
 * @returns {boolean} True if file path indicates agent session
 */
export const is_agent_file_path = (file_path) => {
  const parent_dir = path.basename(path.dirname(file_path))
  const filename = path.basename(file_path, '.jsonl')
  return parent_dir === 'subagents' || filename.startsWith('agent-')
}

/**
 * Iterate over Claude session files from filesystem
 * Async generator that yields file information one at a time for streaming processing.
 *
 * @param {Object} params - Parameters object
 * @param {string} params.claude_projects_directory - Claude projects directory path
 * @yields {{ file_path: string, session_id: string, is_agent: boolean }} Session file info
 */
export async function* iterate_claude_session_files({
  claude_projects_directory = CLAUDE_DEFAULT_PATHS.claude_projects_directory,
  claude_projects_directories = null
} = {}) {
  const dirs = claude_projects_directories || [claude_projects_directory]
  log(`Iterating Claude session files from: ${dirs.join(', ')}`)

  const files = await find_claude_project_files({
    claude_projects_directory,
    claude_projects_directories
  })

  for (const { file_path, base_name } of files) {
    yield {
      file_path,
      session_id: base_name,
      is_agent: is_agent_file_path(file_path)
    }
  }

  log(`Finished iterating ${files.length} session files`)
}

/**
 * Scan all session files to build a lightweight agent relationship index.
 * This enables streaming processing by knowing which sessions are agents
 * and which parent sessions they belong to before full parsing.
 *
 * Memory footprint: ~100 bytes per session (just IDs and file paths)
 *
 * @param {Object} params - Parameters object
 * @param {string} params.claude_projects_directory - Claude projects directory path
 * @returns {Promise<Object>} Agent relationship index
 *   - parent_to_agent_files: Map<parent_session_id, Array<{file_path, agent_id}>>
 *   - agent_session_ids: Set<session_id> - All agent session IDs (to skip during streaming)
 *   - parent_session_files: Map<session_id, file_path> - Parent session file paths
 */
export const scan_claude_agent_relationships = async ({
  claude_projects_directory = CLAUDE_DEFAULT_PATHS.claude_projects_directory,
  claude_projects_directories = null
} = {}) => {
  const dirs = claude_projects_directories || [claude_projects_directory]
  log(`Scanning agent relationships in: ${dirs.join(', ')}`)

  const parent_to_agent_files = new Map()
  const agent_session_ids = new Set()
  const parent_session_files = new Map()

  let total_files = 0
  let agent_count = 0

  for await (const { file_path, session_id } of iterate_claude_session_files({
    claude_projects_directory,
    claude_projects_directories
  })) {
    total_files++

    // Extract minimal metadata to determine agent relationships
    const metadata = await extract_claude_session_metadata({ file_path })

    if (metadata.is_agent) {
      agent_count++
      agent_session_ids.add(session_id)

      // If we have a parent session ID, record the relationship
      if (metadata.parent_session_id) {
        if (!parent_to_agent_files.has(metadata.parent_session_id)) {
          parent_to_agent_files.set(metadata.parent_session_id, [])
        }
        parent_to_agent_files.get(metadata.parent_session_id).push({
          file_path,
          agent_id: metadata.agent_id,
          session_id
        })
      }
    } else {
      // Regular (parent) session
      parent_session_files.set(session_id, file_path)
    }
  }

  log(
    `Agent scan complete: ${total_files} files, ${agent_count} agents, ${parent_session_files.size} parent sessions`
  )

  return {
    parent_to_agent_files,
    agent_session_ids,
    parent_session_files
  }
}

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
 * @param {string} params.session_id - Optional session ID for direct lookup optimization
 * @param {string} params.session_file - Optional absolute path to specific JSONL file
 * @returns {Promise<Array>} Array of raw Claude session objects
 */
export const find_claude_sessions_from_filesystem = async ({
  claude_projects_directory,
  claude_projects_directories = null,
  filter_sessions = null,
  session_id = null,
  session_file = null
}) => {
  const dirs = claude_projects_directories || [claude_projects_directory]
  log(`Finding Claude sessions from filesystem: ${dirs.join(', ')}`)

  if (session_file) {
    log_debug(`Using direct session file path: ${session_file}`)
    const session_id_from_file = path.basename(session_file, '.jsonl')

    // Try incremental path
    const sync_state = await load_sync_state({
      session_id: session_id_from_file
    })

    let sessions
    if (sync_state) {
      sessions = await parse_session_file_incremental({
        session_file,
        session_id: session_id_from_file,
        sync_state
      })
    }

    // Fallback to full parse if incremental returned null or no state
    if (!sessions) {
      const incr_start = Date.now()
      sessions = await parse_session_with_subagents(session_file)
      log_debug(
        `Full parse: ${sessions.length} sessions from ${session_file}`
      )

      // Build and save initial sync state for next invocation
      if (sessions.length > 0) {
        await build_and_save_initial_state({
          session_file,
          sessions,
          session_id: session_id_from_file
        })
      }
      log_perf(
        'find_sessions mode=full_parse session=%s total_ms=%d',
        session_id_from_file,
        Date.now() - incr_start
      )
    }

    // Apply filter_sessions if provided (e.g., for blacklist checking)
    if (filter_sessions && sessions.length > 0) {
      const filtered = sessions.filter(filter_sessions)
      log_debug(
        `Filtered ${sessions.length} sessions to ${filtered.length} sessions`
      )
      return filtered
    }
    return sessions
  }

  // Optimize: if session_id is specified, find and load just that file
  if (session_id) {
    log_debug(`Looking up specific session ID: ${session_id}`)
    const found_file = await find_session_file_by_id({
      session_id,
      claude_projects_directory,
      claude_projects_directories
    })

    if (found_file) {
      log_debug(`Found session file for ID ${session_id}: ${found_file}`)
      const sessions = await parse_session_with_subagents(found_file)
      log_debug(
        `Loaded ${sessions.length} sessions (including subagents) for session ${session_id}`
      )
      // Apply filter_sessions if provided, but skip session_id filtering
      // since we already found the specific session and its subagents
      if (filter_sessions && sessions.length > 0) {
        const filtered = sessions.filter((s) => {
          // Allow agent sessions that belong to this parent
          if (is_agent_session({ session: s })) {
            const parent_id = get_agent_parent_session_id({ session: s })
            if (parent_id === session_id) {
              return true
            }
          }
          return filter_sessions(s)
        })
        return filtered
      }
      return sessions
    }

    log(
      `Session file not found for ID: ${session_id}, falling back to full scan`
    )
  }

  const sessions = await parse_all_claude_files({
    claude_projects_directory,
    claude_projects_directories,
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

  // Entry types that don't require uuid/timestamp (metadata/snapshot/internal entries)
  // queue-operation entries are added when sessions are resumed and lack uuid fields
  const SYSTEM_ENTRY_TYPES = [
    'file-history-snapshot',
    'permission-mode',
    'summary',
    'metadata',
    'queue-operation',
    'progress',
    'attachment',
    'last-prompt',
    'agent-name',
    'custom-title'
  ]

  // Conversation entry types that represent actual user/assistant interaction
  const CONVERSATION_ENTRY_TYPES = ['user', 'assistant']

  if (session.entries) {
    const required_fields = ['uuid', 'timestamp', 'type']
    let has_meaningful_entry = false
    let has_conversation_entry = false

    session.entries.forEach((entry, index) => {
      // Skip validation for system/metadata entry types
      if (entry.type && SYSTEM_ENTRY_TYPES.includes(entry.type)) {
        return
      }

      // Track that we have at least one non-system entry
      has_meaningful_entry = true

      // Track conversation entries (user or assistant messages)
      if (entry.type && CONVERSATION_ENTRY_TYPES.includes(entry.type)) {
        has_conversation_entry = true
      }

      required_fields.forEach((field) => {
        if (!entry[field]) {
          errors.push(`Entry ${index} missing required field: ${field}`)
        }
      })
    })

    // Session must have at least one meaningful entry (not just snapshots)
    if (!has_meaningful_entry) {
      errors.push(
        'Session contains only system entries (snapshots/metadata) with no conversation data'
      )
    }

    // Session must have at least one conversation entry (user or assistant)
    // Sessions with only system/progress entries (e.g. exited before initial prompt) are empty
    if (has_meaningful_entry && !has_conversation_entry) {
      errors.push(
        'Session has no conversation entries (exited before initial user prompt)'
      )
    }
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
      log_debug(`  Session ${session_id}: ${errors.join(', ')}`)
    })
  }

  return {
    valid: valid_sessions,
    invalid: invalid_sessions,
    total: sessions.length
  }
}

/**
 * Check if a session is an agent session
 * Agent sessions are identified by:
 * - Filename starting with "agent-" (8-char hex)
 * - Having agentId in the first entry
 * - Having sessionId pointing to a parent session
 *
 * @param {Object} params - Parameters object
 * @param {Object} params.session - Raw Claude session data
 * @returns {boolean} True if session is an agent session
 */
export const is_agent_session = ({ session }) => {
  const session_id = session.session_id || ''
  if (session_id.startsWith('agent-')) return true

  return Boolean(session.entries?.[0]?.agentId)
}

/**
 * Check if a session is a "warm" initialization session
 * Warm sessions should be excluded from import as they provide no analytical value.
 *
 * Warm session patterns:
 * - Single entry with assistant role containing "ready to help" message
 * - First entry with user role and content "Warmup"
 *
 * @param {Object} params - Parameters object
 * @param {Object} params.session - Raw Claude session data
 * @returns {boolean} True if session is a warm/initialization session
 */
export const is_warm_session = ({ session }) => {
  if (!session.entries || session.entries.length === 0) {
    return true // Empty sessions are considered warm
  }

  const entries = session.entries

  // Pattern 1: Single entry with assistant "ready to help" message
  if (entries.length === 1) {
    const entry = entries[0]
    if (entry.type === 'assistant') {
      const content = extract_entry_text_content(entry)
      if (content && content.toLowerCase().includes('ready to help')) {
        return true
      }
    }
  }

  // Pattern 2: First entry is user with "Warmup" content
  const first_entry = entries[0]
  if (first_entry.type === 'user') {
    const content = extract_entry_text_content(first_entry)
    if (content && content.trim().toLowerCase() === 'warmup') {
      return true
    }
  }

  return false
}

/**
 * Extract text content from an entry's message
 * Handles both string and array content formats
 *
 * @param {Object} entry - Claude session entry
 * @returns {string|null} Text content or null
 */
const extract_entry_text_content = (entry) => {
  if (!entry.message || !entry.message.content) {
    return null
  }

  const content = entry.message.content

  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') {
          return item
        }
        if (item.type === 'text') {
          return item.text || ''
        }
        return ''
      })
      .join(' ')
  }

  return null
}

/**
 * Get the parent session ID from an agent session
 * Agent sessions store their parent's session ID in the sessionId field of entries
 *
 * @param {Object} params - Parameters object
 * @param {Object} params.session - Raw Claude session data
 * @returns {string|null} Parent session ID or null if not found
 */
export const get_agent_parent_session_id = ({ session }) => {
  if (!session.entries || session.entries.length === 0) {
    return null
  }

  // Look for sessionId in entries (this points to parent)
  for (const entry of session.entries) {
    if (entry.sessionId) {
      return entry.sessionId
    }
  }

  return null
}

/**
 * Get the agent ID from an agent session
 * Agent ID is the unique identifier for this agent (8-char hex)
 *
 * @param {Object} params - Parameters object
 * @param {Object} params.session - Raw Claude session data
 * @returns {string|null} Agent ID or null if not found
 */
export const get_agent_id = ({ session }) => {
  // Try to extract from session_id (agent-{8-char-hex})
  const session_id = session.session_id || ''
  if (session_id.startsWith('agent-')) {
    return session_id.replace('agent-', '')
  }

  // Try to get from first entry's agentId
  if (session.entries && session.entries.length > 0) {
    const first_entry = session.entries[0]
    if (first_entry.agentId) {
      return first_entry.agentId
    }
  }

  return null
}

/**
 * Group sessions with their agent sessions
 * Creates a map of parent sessions with their associated agent sessions.
 * Filters out warm agents during grouping.
 *
 * @param {Object} params - Parameters object
 * @param {Array} params.sessions - Array of raw Claude sessions
 * @param {boolean} params.include_warm_agents - Include warm agents (default: false)
 * @returns {Object} { grouped: Map<parent_session_id, {parent_session, agent_sessions}>, orphan_agents: Array, standalone_sessions: Array }
 */
export const group_sessions_with_agents = ({
  sessions,
  include_warm_agents = false
}) => {
  const parent_sessions_map = new Map()
  const agent_sessions_by_parent = new Map()
  const orphan_agents = []
  const standalone_sessions = []
  let warm_agents_excluded = 0

  // First pass: separate agents from regular sessions
  for (const session of sessions) {
    if (is_agent_session({ session })) {
      // Check if warm agent should be excluded
      if (!include_warm_agents && is_warm_session({ session })) {
        warm_agents_excluded++
        log_debug(`Excluding warm agent: ${session.session_id}`)
        continue
      }

      const parent_id = get_agent_parent_session_id({ session })
      if (parent_id) {
        if (!agent_sessions_by_parent.has(parent_id)) {
          agent_sessions_by_parent.set(parent_id, [])
        }
        agent_sessions_by_parent.get(parent_id).push(session)
      } else {
        // Agent without parent reference
        orphan_agents.push(session)
      }
    } else {
      // Regular session - potential parent
      parent_sessions_map.set(session.session_id, session)
    }
  }

  // Second pass: group agents with their parents
  const grouped = new Map()

  for (const [session_id, parent_session] of parent_sessions_map) {
    const agent_sessions = agent_sessions_by_parent.get(session_id) || []

    if (agent_sessions.length > 0) {
      grouped.set(session_id, {
        parent_session,
        agent_sessions
      })
      log_debug(
        `Grouped ${agent_sessions.length} agents with parent session ${session_id}`
      )
    } else {
      // Parent has no agents, treat as standalone
      standalone_sessions.push(parent_session)
    }
  }

  // Handle agents whose parents weren't found in this batch
  for (const [parent_id, agents] of agent_sessions_by_parent) {
    if (!parent_sessions_map.has(parent_id)) {
      log_debug(
        `Found ${agents.length} agents referencing missing parent ${parent_id}`
      )
      orphan_agents.push(...agents)
    }
  }

  log(
    `Session grouping: ${grouped.size} with agents, ${standalone_sessions.length} standalone, ${orphan_agents.length} orphan agents, ${warm_agents_excluded} warm agents excluded`
  )

  return {
    grouped,
    orphan_agents,
    standalone_sessions,
    warm_agents_excluded
  }
}

// ============================================================================
// Incremental Parse Helpers
// ============================================================================

/**
 * Parse a session file and its subagents incrementally using byte offsets.
 * Returns null if any file was replaced (caller should fall back to full parse).
 */
const parse_session_file_incremental = async ({
  session_file,
  session_id,
  sync_state
}) => {
  const incr_start = Date.now()

  // Parse parent file from offset
  const parent_result = await parse_claude_jsonl_from_offset({
    file_path: session_file,
    byte_offset: sync_state.byte_offset
  })

  // File replaced -- caller should do full parse and rebuild state
  if (parent_result === null) {
    log(`Incremental parse reset: parent file replaced for ${session_id}`)
    return null
  }

  // Build parent session object with all entries (new only for normalization,
  // but precomputed_counts carry the full-session totals)
  const parent_session = {
    session_id,
    entries: parent_result.entries,
    metadata: {
      file_path: session_file,
      file_summaries: [
        ...(sync_state.summaries || []),
        ...parent_result.summaries
      ]
    }
  }

  // Extract metadata from new entries
  parent_result.entries.forEach((entry) => {
    if (!parent_session.metadata.cwd && entry.cwd) {
      parent_session.metadata.cwd = entry.cwd
    }
    if (!parent_session.metadata.version && entry.version) {
      parent_session.metadata.version = entry.version
    }
    if (!parent_session.metadata.user_type && entry.userType) {
      parent_session.metadata.user_type = entry.userType
    }
  })

  // Use working_directory from state if not found in new entries
  if (!parent_session.metadata.cwd && sync_state.counts?.working_directory) {
    parent_session.metadata.cwd = sync_state.counts.working_directory
  }

  // Update counts with new entries
  const { counts: updated_counts, models: updated_models } =
    update_sync_counts({
      counts: sync_state.counts || {},
      models: sync_state.models || [],
      new_entries: parent_result.entries
    })

  // Attach precomputed counts for downstream pipeline
  parent_session.precomputed_counts = {
    message_count: updated_counts.user_message_count + updated_counts.assistant_message_count,
    user_message_count: updated_counts.user_message_count || 0,
    assistant_message_count: updated_counts.assistant_message_count || 0,
    tool_call_count: updated_counts.tool_call_count || 0
  }
  parent_session.precomputed_token_counts = {
    input_tokens: updated_counts.input_tokens || 0,
    output_tokens: updated_counts.output_tokens || 0,
    cache_creation_input_tokens:
      updated_counts.cache_creation_input_tokens || 0,
    cache_read_input_tokens: updated_counts.cache_read_input_tokens || 0
  }
  parent_session.precomputed_models = updated_models
  parent_session.incremental = true

  const all_sessions = [parent_session]

  // Handle subagent files incrementally
  const subagent_files = await find_subagent_session_files({
    parent_session_file: session_file
  })

  const new_subagent_offsets = { ...(sync_state.subagent_offsets || {}) }

  for (const agent_file of subagent_files) {
    const agent_basename = path.basename(agent_file)
    const agent_offset =
      sync_state.subagent_offsets?.[agent_basename]?.byte_offset || 0

    try {
      let agent_result
      if (agent_offset > 0) {
        agent_result = await parse_claude_jsonl_from_offset({
          file_path: agent_file,
          byte_offset: agent_offset
        })
      }

      if (agent_result === null || agent_offset === 0) {
        // Full parse for new or replaced subagent file
        const agent_sessions = await parse_claude_jsonl_file(agent_file)
        if (agent_sessions.length > 0) {
          all_sessions.push(...agent_sessions)
        }
        // Record offset so next invocation uses incremental reads
        try {
          const agent_stat = await fs_stat(agent_file)
          new_subagent_offsets[agent_basename] = {
            byte_offset: agent_stat.size
          }
        } catch {
          // File vanished between parse and stat -- skip offset tracking
        }
      } else if (agent_result.entries.length > 0) {
        // Build agent session from incremental entries
        const agent_session = {
          session_id: path.basename(agent_file, '.jsonl'),
          entries: agent_result.entries,
          metadata: { file_path: agent_file, file_summaries: [] }
        }
        all_sessions.push(agent_session)
        new_subagent_offsets[agent_basename] = {
          byte_offset: agent_result.new_byte_offset
        }
      } else {
        // No new data for this subagent
        new_subagent_offsets[agent_basename] = {
          byte_offset: agent_result.new_byte_offset
        }
      }
    } catch (error) {
      log(`Failed to incrementally parse subagent ${agent_file}: ${error.message}`)
    }
  }

  // Save updated state
  await save_sync_state({
    session_id,
    state: {
      byte_offset: parent_result.new_byte_offset,
      subagent_offsets: new_subagent_offsets,
      counts: updated_counts,
      models: updated_models,
      summaries: [
        ...(sync_state.summaries || []),
        ...parent_result.summaries
      ]
    }
  })

  const total_ms = Date.now() - incr_start
  log_perf(
    'find_sessions mode=incremental session=%s new_entries=%d total_ms=%d',
    session_id,
    parent_result.entries.length,
    total_ms
  )

  return all_sessions
}

/**
 * Build and save initial sync state after a full parse.
 * Called on first sync for a session (no existing state file).
 */
const build_and_save_initial_state = async ({
  session_file,
  sessions,
  session_id
}) => {
  try {
    const file_stat = await fs_stat(session_file)
    const parent_session = sessions[0]

    // Build subagent offsets
    const subagent_offsets = {}
    const subagent_files = await find_subagent_session_files({
      parent_session_file: session_file
    })
    for (const agent_file of subagent_files) {
      try {
        const agent_stat = await fs_stat(agent_file)
        subagent_offsets[path.basename(agent_file)] = {
          byte_offset: agent_stat.size
        }
      } catch {
        // Skip files that vanished
      }
    }

    const initial_state = build_initial_sync_state({
      entries: parent_session.entries,
      byte_offset: file_stat.size,
      subagent_offsets,
      summaries: parent_session.metadata?.file_summaries || []
    })

    await save_sync_state({ session_id, state: initial_state })
    log_debug(`Saved initial sync state for session ${session_id}`)
  } catch (error) {
    log(`Failed to save initial sync state: ${error.message}`)
  }
}
