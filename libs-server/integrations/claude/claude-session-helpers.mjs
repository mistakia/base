/**
 * Claude Session Helper Functions
 *
 * Focused helper functions for Claude session processing.
 * Keeps provider class small while handling specific operations.
 */

import debug from 'debug'
import path from 'path'

import {
  parse_all_claude_files,
  parse_session_with_subagents,
  find_session_file_by_id,
  find_claude_project_files,
  extract_claude_session_metadata
} from './parse-jsonl.mjs'
import { normalize_claude_session } from './normalize-session.mjs'
import { CLAUDE_DEFAULT_PATHS } from './claude-config.mjs'

const log = debug('integrations:claude:session-helpers')
const log_debug = debug('integrations:claude:session-helpers:debug')

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
    // Import specific file and its associated subagent sessions
    const sessions = await parse_session_with_subagents(session_file)
    log_debug(
      `Loaded ${sessions.length} sessions (including subagents) from ${session_file}`
    )
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
 * Check if an agent session is a "warm" initialization agent
 * Warm agents should be excluded from import as they provide no analytical value.
 *
 * Warm agent patterns:
 * - Single entry with assistant role containing "ready to help" message
 * - First entry with user role and content "Warmup"
 *
 * @param {Object} params - Parameters object
 * @param {Object} params.session - Raw Claude session data
 * @returns {boolean} True if agent is a warm/initialization agent
 */
export const is_warm_agent = ({ session }) => {
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
      if (!include_warm_agents && is_warm_agent({ session })) {
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
