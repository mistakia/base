// Extract per-turn text from timeline.jsonl and upsert into thread_timeline.
// DELETE+INSERT is idempotent; caller (pipeline cache) gates calls.

import path from 'path'
import { promises as fs } from 'fs'
import debug from 'debug'

import config from '#config'
import { get_thread_base_directory } from '#libs-server/threads/threads-constants.mjs'
import {
  execute_sqlite_run,
  with_sqlite_transaction
} from '#libs-server/embedded-database-index/sqlite/sqlite-database-client.mjs'
import { extract_turns_from_timeline } from './turn-extractor.mjs'

const log = debug('embedded-index:sync:thread-timeline')

const TURN_BATCH_SIZE = 100

/**
 * Sync a single thread's timeline into the thread_timeline table.
 *
 * @param {Object} params
 * @param {string} params.thread_id
 * @param {string} [params.user_base_directory] - Override for tests
 * @returns {Promise<{thread_id: string, turns_written: number}>}
 */
export async function sync_thread_timeline({
  thread_id,
  user_base_directory
}) {
  if (!thread_id) {
    throw new Error('sync_thread_timeline requires thread_id')
  }

  const base_directory =
    user_base_directory ||
    config.user_base_directory ||
    process.env.USER_BASE_DIRECTORY

  if (!base_directory) {
    throw new Error('USER_BASE_DIRECTORY not configured')
  }

  const thread_base_directory = get_thread_base_directory({
    user_base_directory: base_directory
  })
  const timeline_path = path.join(
    thread_base_directory,
    thread_id,
    'timeline.jsonl'
  )

  const turns = await extract_turns_from_timeline({ thread_id, timeline_path })

  await with_sqlite_transaction(async () => {
    await execute_sqlite_run({
      query: 'DELETE FROM thread_timeline WHERE thread_id = ?',
      parameters: [thread_id]
    })

    for (let i = 0; i < turns.length; i += TURN_BATCH_SIZE) {
      const chunk = turns.slice(i, i + TURN_BATCH_SIZE)
      const placeholders = chunk.map(() => '(?, ?, ?, ?)').join(', ')
      const parameters = chunk.flatMap((turn) => [
        thread_id,
        turn.turn_index,
        turn.turn_text,
        turn.first_timestamp
      ])

      await execute_sqlite_run({
        query: `INSERT INTO thread_timeline (thread_id, turn_index, turn_text, first_timestamp)
                VALUES ${placeholders}`,
        parameters
      })
    }
  })

  log('Synced %d turns for thread %s', turns.length, thread_id)
  return { thread_id, turns_written: turns.length }
}

/**
 * Delete all thread_timeline rows for a thread. Called when a thread is
 * removed from the filesystem so orphan rows do not linger in the FTS index.
 *
 * @param {Object} params
 * @param {string} params.thread_id
 */
export async function delete_thread_timeline({ thread_id }) {
  if (!thread_id) return
  await execute_sqlite_run({
    query: 'DELETE FROM thread_timeline WHERE thread_id = ?',
    parameters: [thread_id]
  })
}

/**
 * Iterate all thread/<uuid>/ directories and sync thread_timeline for each.
 * DELETE+INSERT is idempotent so this is safe to re-run; no checkpoint needed.
 *
 * @param {Object} [params]
 * @param {string} [params.user_base_directory]
 * @param {number} [params.batch_size=50] - Threads per progress log entry
 * @param {(progress: {processed: number, total: number}) => void} [params.on_progress]
 * @returns {Promise<{total: number, synced: number, failed: number}>}
 */
export async function sync_all_thread_timelines({
  user_base_directory,
  batch_size = 50,
  on_progress
} = {}) {
  const base_directory =
    user_base_directory ||
    config.user_base_directory ||
    process.env.USER_BASE_DIRECTORY

  if (!base_directory) {
    throw new Error('USER_BASE_DIRECTORY not configured')
  }

  const thread_base_directory = get_thread_base_directory({
    user_base_directory: base_directory
  })

  let entries
  try {
    entries = await fs.readdir(thread_base_directory, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { total: 0, synced: 0, failed: 0 }
    }
    throw error
  }

  const thread_ids = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)

  let synced = 0
  let failed = 0

  for (let i = 0; i < thread_ids.length; i++) {
    const thread_id = thread_ids[i]
    const timeline_path = path.join(
      thread_base_directory,
      thread_id,
      'timeline.jsonl'
    )
    try {
      await fs.access(timeline_path)
    } catch {
      continue
    }
    try {
      await sync_thread_timeline({
        thread_id,
        user_base_directory: base_directory
      })
      synced++
    } catch (error) {
      log('Failed to sync timeline for %s: %s', thread_id, error.message)
      failed++
    }

    if (on_progress && (i + 1) % batch_size === 0) {
      on_progress({ processed: i + 1, total: thread_ids.length })
    }
  }

  if (on_progress && thread_ids.length % batch_size !== 0) {
    on_progress({ processed: thread_ids.length, total: thread_ids.length })
  }

  return { total: thread_ids.length, synced, failed }
}

