import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'

import { get_user_base_directory } from '#libs-server/base-uri/index.mjs'
import { get_thread_base_directory } from '#libs-server/threads/threads-constants.mjs'

const log = debug('embedded-index:sync:stuck-thread-sweep')

const METADATA_FILE_NAME = 'metadata.json'
const DEFAULT_STUCK_THRESHOLD_MS = 5 * 60 * 1000
const DEFAULT_FRESH_WINDOW_MS = 24 * 60 * 60 * 1000

let sweep_in_progress = false

/**
 * Find threads that started a session but never advanced past
 * session_status=starting. The hook script lifecycle (SessionStart ->
 * UserPromptSubmit -> ... -> SessionEnd) is the only thing that moves a
 * thread through active/idle/completed; any failure in that chain (broken
 * hook, missing settings.json, network drop) leaves the thread stuck and
 * silent. This sweep is the single visible signal that the chain broke.
 *
 * The sweep does NOT recover or patch metadata. Recovery is the job of
 * the post-completion fallback in job-worker; this is the alarm for
 * failures the fallback also missed.
 *
 * Scoped to threads whose metadata.json was modified within fresh_window_ms
 * to avoid re-scanning historical archive content on every interval.
 */
export const run_stuck_thread_sweep = async ({
  verbose = false,
  stuck_threshold_ms = DEFAULT_STUCK_THRESHOLD_MS,
  fresh_window_ms = DEFAULT_FRESH_WINDOW_MS,
  user_base_directory = null
} = {}) => {
  if (sweep_in_progress) return { ran: false, skipped: true }
  sweep_in_progress = true
  const started_at = Date.now()
  const stuck = []
  let scanned = 0

  try {
    const ub = user_base_directory || get_user_base_directory()
    const thread_dir = get_thread_base_directory({ user_base_directory: ub })

    let entries
    try {
      entries = await fs.readdir(thread_dir, { withFileTypes: true })
    } catch (error) {
      if (error.code !== 'ENOENT') {
        log('readdir failed: %s', error.message)
      }
      return { ran: true, stuck, scanned }
    }

    const now_ms = Date.now()
    const fresh_floor = now_ms - fresh_window_ms
    const stuck_threshold_at = now_ms - stuck_threshold_ms

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const metadata_path = path.join(
        thread_dir,
        entry.name,
        METADATA_FILE_NAME
      )
      try {
        const stat = await fs.stat(metadata_path)
        if (stat.mtimeMs < fresh_floor) continue
        scanned++
        const raw = await fs.readFile(metadata_path, 'utf-8')
        const meta = JSON.parse(raw)
        if (meta.session_status !== 'starting') continue
        const updated_at_ms =
          Date.parse(meta.updated_at || meta.created_at) || 0
        if (!updated_at_ms || updated_at_ms > stuck_threshold_at) continue
        stuck.push({
          thread_id: meta.thread_id,
          job_id: meta.job_id || null,
          container_name: meta.execution?.container_name || null,
          updated_at: meta.updated_at,
          age_ms: now_ms - updated_at_ms
        })
      } catch (error) {
        if (error.code !== 'ENOENT') {
          log('parse %s failed: %s', metadata_path, error.message)
        }
      }
    }

    if (stuck.length > 0) {
      log(
        'stuck threads detected: count=%d scanned=%d duration_ms=%d',
        stuck.length,
        scanned,
        Date.now() - started_at
      )
      for (const t of stuck) {
        log(
          'stuck thread: id=%s job_id=%s container=%s age_minutes=%d',
          t.thread_id,
          t.job_id || '<none>',
          t.container_name || '<none>',
          Math.floor(t.age_ms / 60000)
        )
      }
    } else if (verbose) {
      log('sweep complete: no stuck threads (scanned=%d)', scanned)
    }

    return { ran: true, stuck, scanned }
  } finally {
    sweep_in_progress = false
  }
}
