/**
 * Sync State Helpers
 *
 * Persists parse offset and accumulated counts between hook invocations.
 * State files live in /tmp/ and are ephemeral by design -- loss degrades
 * gracefully to a full parse on next sync.
 */

import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import debug from 'debug'

const log = debug('integrations:claude:sync-state')

const state_path_for_session = (session_id) =>
  path.join(os.tmpdir(), `claude-sync-state-${session_id}.json`)

export const load_sync_state = async ({ session_id }) => {
  try {
    const content = await fs.readFile(
      state_path_for_session(session_id),
      'utf-8'
    )
    const state = JSON.parse(content)
    // Basic shape validation
    if (typeof state.byte_offset !== 'number') return null
    return state
  } catch {
    return null
  }
}

export const save_sync_state = async ({ session_id, state }) => {
  const target = state_path_for_session(session_id)
  const tmp = target + '.tmp'
  await fs.writeFile(tmp, JSON.stringify(state))
  await fs.rename(tmp, target)
}

export const clear_sync_state = async ({ session_id }) => {
  try {
    await fs.unlink(state_path_for_session(session_id))
  } catch {
    // Already gone -- fine
  }
}

/**
 * Pure function: accumulate counters from new raw JSONL entries.
 * Returns a new counts/models/timestamps object without mutating inputs.
 */
export const update_sync_counts = ({ counts, models, new_entries }) => {
  const updated = { ...counts }
  const model_set = new Set(models)

  for (const entry of new_entries) {
    updated.message_count = (updated.message_count || 0) + 1

    if (entry.type === 'user') {
      updated.user_message_count = (updated.user_message_count || 0) + 1
    } else if (entry.type === 'assistant') {
      updated.assistant_message_count =
        (updated.assistant_message_count || 0) + 1

      if (entry.message?.usage) {
        const u = entry.message.usage
        updated.input_tokens = (updated.input_tokens || 0) + (u.input_tokens || 0)
        updated.output_tokens =
          (updated.output_tokens || 0) + (u.output_tokens || 0)
        updated.cache_creation_input_tokens =
          (updated.cache_creation_input_tokens || 0) +
          (u.cache_creation_input_tokens || 0)
        updated.cache_read_input_tokens =
          (updated.cache_read_input_tokens || 0) +
          (u.cache_read_input_tokens || 0)
      }

      if (entry.message?.model) {
        model_set.add(entry.message.model)
      }
    }

    // Count tool_use content blocks within assistant messages as tool calls
    if (entry.type === 'assistant' && Array.isArray(entry.message?.content)) {
      for (const block of entry.message.content) {
        if (block.type === 'tool_use') {
          updated.tool_call_count = (updated.tool_call_count || 0) + 1
        }
      }
    }

    if (entry.timestamp) {
      updated.last_timestamp = entry.timestamp
      if (!updated.first_timestamp) {
        updated.first_timestamp = entry.timestamp
      }
    }

    if (!updated.working_directory && entry.cwd) {
      updated.working_directory = entry.cwd
    }
  }

  return { counts: updated, models: Array.from(model_set) }
}

/**
 * Build initial sync state from a full parse result.
 */
export const build_initial_sync_state = ({
  entries,
  byte_offset,
  subagent_offsets = {},
  summaries = []
}) => {
  const { counts, models } = update_sync_counts({
    counts: {},
    models: [],
    new_entries: entries
  })

  return {
    byte_offset,
    subagent_offsets,
    counts,
    models,
    summaries
  }
}
