/**
 * Pi Sync State Helpers
 *
 * Per-host byte-offset cache keyed by absolute Pi session file path.
 * Pi sessions are append-only within a file but a single file can host
 * multiple branches; the file path is the stable identifier across
 * leaf shifts, so we key on it (not on a session_id) -- a deliberate
 * divergence from Claude's sync-state.mjs precedent.
 *
 * State shape carries leaf_id and branch_thread_id in addition to the
 * Claude-style { byte_offset, last_entry_id, schema_version } so
 * tree-aware fork detection can short-circuit the delta path. State
 * files live in os.tmpdir() and are ephemeral; loss degrades to a
 * full re-parse on next sync.
 */

import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import crypto from 'crypto'

export const state_path_for_session_file = (session_file) => {
  const digest = crypto
    .createHash('sha256')
    .update(session_file)
    .digest('hex')
    .slice(0, 16)
  return path.join(os.tmpdir(), `pi-sync-state-${digest}.json`)
}

export const load_pi_sync_state = async ({ session_file }) => {
  try {
    const content = await fs.readFile(
      state_path_for_session_file(session_file),
      'utf-8'
    )
    const state = JSON.parse(content)
    if (typeof state.byte_offset !== 'number') return null
    return state
  } catch {
    return null
  }
}

export const save_pi_sync_state = async ({ session_file, state }) => {
  const target = state_path_for_session_file(session_file)
  const tmp = target + '.tmp'
  await fs.writeFile(tmp, JSON.stringify(state))
  await fs.rename(tmp, target)
}

export const clear_pi_sync_state = async ({ session_file }) => {
  try {
    await fs.unlink(state_path_for_session_file(session_file))
  } catch {
    // Already gone -- fine
  }
}
