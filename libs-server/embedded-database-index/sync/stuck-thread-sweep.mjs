import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'

import { get_user_base_directory } from '#libs-server/base-uri/index.mjs'
import { get_thread_base_directory } from '#libs-server/threads/threads-constants.mjs'

const log = debug('embedded-index:sync:stuck-thread-sweep')

const METADATA_FILE_NAME = 'metadata.json'
const STUCK_THRESHOLD_MS = 5 * 60 * 1000
const FRESH_WINDOW_MS = 24 * 60 * 60 * 1000

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
    const fresh_floor = now_ms - FRESH_WINDOW_MS
    const stuck_threshold_at = now_ms - STUCK_THRESHOLD_MS

    // Stat every directory entry in parallel; mtime filter then prunes
    // stale entries before the read+parse pass. Serial stat per entry
    // dominated wall-time on installs with thousands of historical threads.
    const candidates = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const metadata_path = path.join(
            thread_dir,
            entry.name,
            METADATA_FILE_NAME
          )
          try {
            const stat = await fs.stat(metadata_path)
            if (stat.mtimeMs < fresh_floor) return null
            return metadata_path
          } catch (error) {
            if (error.code !== 'ENOENT') {
              log('stat %s failed: %s', metadata_path, error.message)
            }
            return null
          }
        })
    )

    for (const metadata_path of candidates) {
      if (!metadata_path) continue
      try {
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

    const duration_ms = Date.now() - started_at
    if (stuck.length > 0) {
      log(
        'stuck threads detected: count=%d scanned=%d entries=%d duration_ms=%d',
        stuck.length,
        scanned,
        entries.length,
        duration_ms
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
    } else {
      log(
        'sweep complete: scanned=%d entries=%d duration_ms=%d',
        scanned,
        entries.length,
        duration_ms
      )
    }

    return { ran: true, stuck, scanned }
  } finally {
    sweep_in_progress = false
  }
}
