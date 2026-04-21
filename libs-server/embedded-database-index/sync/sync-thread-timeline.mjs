/**
 * Sync Thread Timeline
 *
 * Extract per-turn text from a thread's timeline.jsonl and upsert rows into
 * the thread_timeline base table. DELETE+INSERT is idempotent; no per-module
 * mtime cache is kept -- the live pipeline's _timeline_sync_cache gates calls.
 */

import path from 'path'
import debug from 'debug'

import config from '#config'
import {
  execute_sqlite_run,
  with_sqlite_transaction
} from '#libs-server/embedded-database-index/sqlite/sqlite-database-client.mjs'
import { get_thread_base_directory } from '#libs-server/threads/threads-constants.mjs'
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

export default { sync_thread_timeline, delete_thread_timeline }
