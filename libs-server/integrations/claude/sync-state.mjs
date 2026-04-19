/**
 * Sync State Helpers
 *
 * Persists a minimal parse cursor between hook invocations:
 * { byte_offset, subagent_offsets, working_directory }. Aggregates
 * (counts, models, summaries) are derived on each parse from the
 * append-only source JSONL, so they are not persisted here. State
 * files live in os.tmpdir() and are ephemeral by design -- loss
 * degrades gracefully to a full parse on next sync.
 *
 * The helper hashes the caller-supplied identifier internally, so
 * callers may pass any stable per-source key (absolute source path
 * preferred) without worrying about filename collisions on disk.
 */

import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import crypto from 'crypto'

export const state_path_for_session = (session_id) => {
  const digest = crypto
    .createHash('sha256')
    .update(session_id)
    .digest('hex')
    .slice(0, 16)
  return path.join(os.tmpdir(), `claude-sync-state-${digest}.json`)
}

export const load_sync_state = async ({ session_id }) => {
  try {
    const content = await fs.readFile(
      state_path_for_session(session_id),
      'utf-8'
    )
    const state = JSON.parse(content)
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
