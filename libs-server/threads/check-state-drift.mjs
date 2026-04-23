import readline from 'readline'
import { createReadStream } from 'fs'

import {
  THREAD_STATE,
  VALID_ARCHIVE_REASONS
} from '#libs-server/threads/threads-constants.mjs'

const is_terminal_archive_entry = (entry) => {
  if (!entry || typeof entry !== 'object') return false
  if (entry.type !== 'system') return false
  if (entry.system_type !== 'state_change') return false
  const meta = entry.metadata
  if (!meta || typeof meta !== 'object') return false
  return meta.to_state === THREAD_STATE.ARCHIVED
}

/**
 * Detect drift between a thread's timeline terminal archival entry and its
 * metadata.json thread_state. Streams timeline.jsonl without loading into
 * memory; accepts both legacy and consolidated shapes (thread_lifecycle flag
 * is not required). thread_id is log-context only -- no filesystem I/O is
 * performed beyond reading timeline_path.
 *
 * @param {Object} params
 * @param {string} params.thread_id      Log context only.
 * @param {string} params.timeline_path  Absolute path to timeline.jsonl.
 * @param {Object} params.metadata       Parsed metadata.json contents.
 * @returns {Promise<{ drift: null } | { drift: {
 *   terminal_entry: Object,
 *   repairable: boolean,
 *   repair_inputs: { thread_state: string, archived_at: string, archive_reason: string } | null
 * }}>}
 */
export async function check_state_drift({
  thread_id,
  timeline_path,
  metadata
}) {
  if (!timeline_path) throw new Error('timeline_path is required')
  if (!metadata || typeof metadata !== 'object') {
    throw new Error('metadata is required')
  }

  let terminal_entry = null
  let stream
  try {
    stream = createReadStream(timeline_path, { encoding: 'utf8' })
  } catch {
    return { drift: null }
  }

  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })

  try {
    for await (const line of rl) {
      if (!line.trim()) continue
      let entry
      try {
        entry = JSON.parse(line)
      } catch {
        continue
      }
      if (is_terminal_archive_entry(entry)) {
        terminal_entry = entry
      }
    }
  } catch {
    return { drift: null }
  }

  if (!terminal_entry) return { drift: null }

  if (metadata.thread_state === THREAD_STATE.ARCHIVED) {
    return { drift: null }
  }

  const reason = terminal_entry.metadata && terminal_entry.metadata.reason
  const archived_at =
    (terminal_entry.metadata && terminal_entry.metadata.archived_at) ||
    terminal_entry.timestamp ||
    null

  const reason_valid = Boolean(reason) && VALID_ARCHIVE_REASONS.includes(reason)
  const has_timestamp = Boolean(archived_at)
  const repairable = reason_valid && has_timestamp

  const repair_inputs = repairable
    ? {
        thread_state: THREAD_STATE.ARCHIVED,
        archived_at,
        archive_reason: reason
      }
    : null

  return {
    drift: {
      thread_id,
      terminal_entry,
      repairable,
      repair_inputs
    }
  }
}
