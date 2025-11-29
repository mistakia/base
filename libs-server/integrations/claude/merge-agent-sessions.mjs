/**
 * Merge Agent Sessions into Parent Sessions
 *
 * Functions for merging agent session entries into their parent session timelines.
 * Agent conversations appear as sidechain entries within the parent thread.
 */

import debug from 'debug'
import { get_agent_id } from './claude-session-helpers.mjs'

const log = debug('integrations:claude:merge-agent-sessions')
const log_debug = debug('integrations:claude:merge-agent-sessions:debug')

/**
 * Find the Task tool_call entry in parent that spawned this agent
 * Looks for toolUseResult entries with matching agentId
 *
 * @param {Object} params - Parameters object
 * @param {Array} params.parent_entries - Parent session entries
 * @param {string} params.agent_id - Agent ID to find
 * @returns {Object|null} { tool_call_index, tool_result_index, tool_call_id } or null
 */
const find_agent_spawn_point = ({ parent_entries, agent_id }) => {
  // Find the toolUseResult entry that references this agent
  let tool_result_index = -1
  let tool_call_id = null

  for (let i = 0; i < parent_entries.length; i++) {
    const entry = parent_entries[i]

    // Look for user entry with toolUseResult containing agentId
    if (entry.type === 'user' && entry.toolUseResult) {
      if (entry.toolUseResult.agentId === agent_id) {
        tool_result_index = i
        tool_call_id = entry.toolUseID || entry.toolUseResult.toolUseId
        break
      }
    }
  }

  if (tool_result_index === -1) {
    log_debug(`Could not find toolUseResult for agent ${agent_id}`)
    return null
  }

  // Find the corresponding Task tool_call entry by searching backwards
  // The tool_call should be in an assistant message before the tool_result
  let tool_call_index = -1

  for (let i = tool_result_index - 1; i >= 0; i--) {
    const entry = parent_entries[i]

    if (entry.type === 'assistant' && entry.message?.content) {
      const content = entry.message.content
      if (Array.isArray(content)) {
        const has_task_tool = content.some(
          (item) =>
            item.type === 'tool_use' &&
            item.name === 'Task' &&
            (item.id === tool_call_id ||
              // Also check by proximity if IDs don't match exactly
              !tool_call_id)
        )

        if (has_task_tool) {
          tool_call_index = i
          break
        }
      }
    }
  }

  if (tool_call_index === -1) {
    // Fall back to using tool_result_index - 1 as best guess
    tool_call_index = Math.max(0, tool_result_index - 1)
    log_debug(
      `Using fallback tool_call_index ${tool_call_index} for agent ${agent_id}`
    )
  }

  return {
    tool_call_index,
    tool_result_index,
    tool_call_id
  }
}

/**
 * Merge agent entries into parent session
 * Agent entries are inserted at the appropriate position and marked as sidechain
 *
 * @param {Object} params - Parameters object
 * @param {Object} params.parent_session - Parent session object
 * @param {Array} params.agent_sessions - Array of agent sessions to merge
 * @returns {Object} Merged session with updated entries array
 */
export const merge_agent_entries_into_parent = ({
  parent_session,
  agent_sessions
}) => {
  if (!agent_sessions || agent_sessions.length === 0) {
    return parent_session
  }

  log(`Merging ${agent_sessions.length} agents into session ${parent_session.session_id}`)

  // Create a copy of parent entries to modify
  const merged_entries = [...parent_session.entries]

  // Track insertion offset as we add entries
  let insertion_offset = 0
  let total_agent_entries = 0

  // Process each agent session
  for (const agent_session of agent_sessions) {
    const agent_id = get_agent_id({ session: agent_session })

    if (!agent_id) {
      log(`Warning: Could not get agent_id for session ${agent_session.session_id}`)
      continue
    }

    // Find where this agent was spawned in the parent
    const spawn_point = find_agent_spawn_point({
      parent_entries: parent_session.entries,
      agent_id
    })

    if (!spawn_point) {
      log_debug(`Could not find spawn point for agent ${agent_id}, appending entries at end`)
    }

    // Prepare agent entries with sidechain marking
    const agent_entries = agent_session.entries.map((entry) => ({
      ...entry,
      isSidechain: true,
      agentSessionId: agent_session.session_id,
      parentAgentId: agent_id
    }))

    // Calculate insertion position
    // Insert after the tool_call entry, before the tool_result
    const insertion_index = spawn_point
      ? spawn_point.tool_call_index + 1 + insertion_offset
      : merged_entries.length

    // Insert agent entries
    merged_entries.splice(insertion_index, 0, ...agent_entries)

    // Update offset for subsequent agent insertions
    insertion_offset += agent_entries.length
    total_agent_entries += agent_entries.length

    log_debug(
      `Inserted ${agent_entries.length} entries for agent ${agent_id} at position ${insertion_index}`
    )
  }

  log(`Merged ${total_agent_entries} agent entries into parent session`)

  // Return merged session
  return {
    ...parent_session,
    entries: merged_entries,
    metadata: {
      ...parent_session.metadata,
      merged_agent_count: agent_sessions.length,
      merged_agent_entries: total_agent_entries,
      merged_agent_ids: agent_sessions.map((s) => get_agent_id({ session: s }))
    }
  }
}

/**
 * Assign sequential sequence numbers to merged timeline
 * Sorts entries by timestamp and assigns sequential numbers
 *
 * @param {Object} params - Parameters object
 * @param {Object} params.session - Session with merged entries
 * @returns {Object} Session with updated sequence numbers
 */
export const assign_merged_sequence_numbers = ({ session }) => {
  if (!session.entries || session.entries.length === 0) {
    return session
  }

  // Sort entries by timestamp
  const sorted_entries = [...session.entries].sort((a, b) => {
    const time_a = new Date(a.timestamp).getTime()
    const time_b = new Date(b.timestamp).getTime()

    // If timestamps are equal, preserve relative order
    // (agent entries should come after their spawn point)
    if (time_a === time_b) {
      // Sidechain entries come after non-sidechain entries at same timestamp
      if (a.isSidechain && !b.isSidechain) return 1
      if (!a.isSidechain && b.isSidechain) return -1
      return 0
    }

    return time_a - time_b
  })

  // Assign sequential numbers
  const entries_with_sequence = sorted_entries.map((entry, index) => ({
    ...entry,
    merged_sequence: index
  }))

  log_debug(`Assigned sequence numbers 0-${entries_with_sequence.length - 1}`)

  return {
    ...session,
    entries: entries_with_sequence
  }
}

/**
 * Full merge pipeline: merge agents and assign sequences
 *
 * @param {Object} params - Parameters object
 * @param {Object} params.parent_session - Parent session object
 * @param {Array} params.agent_sessions - Array of agent sessions to merge
 * @returns {Object} Fully merged and sequenced session
 */
export const merge_and_sequence_agent_sessions = ({
  parent_session,
  agent_sessions
}) => {
  // First merge the entries
  const merged_session = merge_agent_entries_into_parent({
    parent_session,
    agent_sessions
  })

  // Then assign sequence numbers
  const sequenced_session = assign_merged_sequence_numbers({
    session: merged_session
  })

  return sequenced_session
}
