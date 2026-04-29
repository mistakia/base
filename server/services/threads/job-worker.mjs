import { join } from 'path'
import { readFile, access } from 'fs/promises'
import { homedir } from 'os'
import { Worker } from 'bullmq'
import debug from 'debug'
import { glob } from 'glob'
import config from '#config'
import {
  get_redis_connection,
  close_redis_connection
} from '#server/services/redis/get-connection.mjs'
import { add_cli_job } from '#server/services/cli-queue/queue.mjs'
import {
  emit_thread_job_failed,
  emit_thread_job_started
} from '#server/services/active-sessions/session-event-emitter.mjs'
import {
  create_session_claude_cli,
  get_container_claude_home,
  derive_projects_dir_name
} from '#libs-server/threads/create-session-claude-cli.mjs'
import { get_user_container_claude_home } from '#libs-server/threads/user-container-manager.mjs'
import patch_thread_metadata from '#libs-server/threads/patch-thread-metadata.mjs'
import { get_thread_base_directory } from '#libs-server/threads/threads-constants.mjs'
import { get_user_base_directory } from '#libs-server/base-uri/index.mjs'
import { translate_to_container_path } from '#libs-server/container/execution-mode.mjs'
import { create_threads_from_session_provider } from '#libs-server/integrations/thread/create-threads-from-session-provider.mjs'
import { build_execution_attribution } from '#libs-server/threads/execution-attribution.mjs'
import {
  acquire_lease,
  release_lease
} from '#libs-server/threads/lease-client.mjs'
import { get_current_machine_id } from '#libs-server/schedule/machine-identity.mjs'
import {
  select_account,
  handle_rate_limit_failure,
  handle_auth_failure
} from '#libs-server/integrations/claude/account-rotation/index.mjs'
import {
  check_account_usage,
  classify_usage_result
} from '#libs-server/integrations/claude/account-rotation/check-usage.mjs'

const log = debug('threads:worker')

// Constants
const QUEUE_NAME = 'thread-creation'
const DEFAULT_CONCURRENCY = 3
const LOCK_DURATION_MS = 600000 // 10 minutes - long-running Claude CLI sessions
// 15 minutes: outlives the BullMQ lock so a missed hook renewal does not
// release the lease in the same window the lock expires.
const LEASE_TTL_MS = 900000
const STALLED_INTERVAL_MS = 30000 // Check for stalled jobs every 30 seconds
const LOCK_EXTEND_INTERVAL_MS = 300000 // Extend lock every 5 minutes
const MAX_STALLED_COUNT = 0 // Disable stall re-queuing (detached processes survive crashes)
const EXHAUSTED_DELAY_DEFAULT_MS = 300000 // 5 minutes default delay when all accounts exhausted
const EXHAUSTED_KEY_PREFIX = 'claude:exhausted:'

// Authentication error patterns observed in Claude CLI stderr output.
// Only add patterns confirmed to appear in actual Claude CLI stderr.
const AUTH_ERROR_PATTERNS = ['authentication_error', 'authentication_failed']
const AUTH_FAILED_KEY_PREFIX = 'claude:auth_failed:'

/**
 * Detect authentication errors from Claude CLI error output.
 * Only matches errors that include the "Claude CLI exited with code" prefix
 * to avoid false positives from unrelated errors (Redis auth, HTTP 401, etc.).
 */
const is_cli_auth_error = (error_message) => {
  if (!error_message) return false
  if (!error_message.startsWith('Claude CLI exited with code')) return false
  const lower = error_message.toLowerCase()
  return AUTH_ERROR_PATTERNS.some((pattern) => lower.includes(pattern))
}

// Module state
let thread_worker = null

/**
 * Get delay in ms until the earliest unavailable account marker expires.
 * Scans both exhausted and auth_failed keys so that auth-only failures
 * do not fall back to the short 5-minute default.
 * Falls back to EXHAUSTED_DELAY_DEFAULT_MS if TTLs cannot be read.
 */
const get_unavailable_delay_ms = async () => {
  try {
    const redis = get_redis_connection()
    const [exhausted_keys, auth_failed_keys] = await Promise.all([
      redis.keys(`${EXHAUSTED_KEY_PREFIX}*`),
      redis.keys(`${AUTH_FAILED_KEY_PREFIX}*`)
    ])
    const keys = [...exhausted_keys, ...auth_failed_keys]
    if (keys.length === 0) return EXHAUSTED_DELAY_DEFAULT_MS

    let min_ttl_ms = Infinity
    for (const key of keys) {
      const ttl = await redis.ttl(key)
      if (ttl > 0) {
        min_ttl_ms = Math.min(min_ttl_ms, ttl * 1000)
      }
    }

    // Add 30s buffer after TTL expiry
    return min_ttl_ms === Infinity
      ? EXHAUSTED_DELAY_DEFAULT_MS
      : min_ttl_ms + 30000
  } catch {
    return EXHAUSTED_DELAY_DEFAULT_MS
  }
}

/**
 * Check if an account is rate-limited by querying the usage API.
 * If utilization is at or above threshold, mark the account exhausted.
 * This avoids false positives from non-rate-limit failures (git errors,
 * timeouts, etc.) by confirming with the actual usage data.
 */
const check_and_mark_if_exhausted = async (job_id, account) => {
  const threshold = config.claude_accounts?.utilization_threshold || 90
  try {
    const usage = await check_account_usage({
      namespace: account.namespace,
      org_uuid: account.org_uuid,
      browser_profile: account.browser_profile
    })

    const verdict = classify_usage_result({
      utilization: usage.utilization,
      threshold
    })

    if (verdict === 'unmeasurable') {
      log(
        `Job ${job_id}: cannot measure %s (%s) -- skipping exhaustion marking`,
        account.namespace,
        usage.error || 'no utilization data'
      )
      return
    }

    if (verdict === 'over') {
      log(
        `Job ${job_id}: account %s confirmed over threshold, marking`,
        account.namespace
      )
      await handle_rate_limit_failure({
        namespace: account.namespace,
        org_uuid: account.org_uuid,
        browser_profile: account.browser_profile
      })
      return
    }

    const five_hour = usage.utilization.five_hour?.utilization
    const seven_day = usage.utilization.seven_day?.utilization
    log(
      `Job ${job_id}: account %s not rate-limited (5h: %d%%, 7d: %d%%, threshold: %d%%)`,
      account.namespace,
      five_hour,
      seven_day,
      threshold
    )
  } catch (check_error) {
    log(
      `Job ${job_id}: usage check failed for %s, skipping exhaustion marking: %s`,
      account.namespace,
      check_error.message
    )
  }
}

/**
 * Update session_status in a thread's metadata.json via shared patch function.
 */
const update_thread_session_status = async ({
  thread_id,
  session_status,
  caller_flag = {}
}) => {
  try {
    await patch_thread_metadata({
      thread_id,
      patches: { session_status },
      caller_flag
    })
  } catch (error) {
    log(
      `Thread ${thread_id}: failed to update session_status - ${error.message}`
    )
  }
}

/**
 * Read a thread's metadata.json from disk.
 */
const read_thread_metadata = async (thread_id) => {
  const user_base_directory = get_user_base_directory()
  const thread_base_directory = get_thread_base_directory({
    user_base_directory
  })
  const metadata_path = join(thread_base_directory, thread_id, 'metadata.json')
  const raw = await readFile(metadata_path, 'utf-8')
  return JSON.parse(raw)
}

/**
 * Process a thread creation job
 * Creates or resumes a Claude CLI session
 */
const process_thread_creation_job = async (job) => {
  const {
    prompt,
    working_directory,
    user_public_key,
    session_id = null,
    thread_id = null,
    execution_mode,
    thread_config = null,
    username = null
  } = job.data

  const action = session_id ? 'resuming' : 'starting new'
  log(
    `Job ${job.id}: ${action} Claude CLI session${session_id ? ` ${session_id}` : ''}`
  )

  // Periodically extend job lock to prevent BullMQ from marking long-running
  // Claude CLI sessions as stalled. Sessions can run for 60+ minutes but the
  // lock expires after LOCK_DURATION_MS. This interval renews it.
  const lock_interval = setInterval(async () => {
    try {
      await job.extendLock(job.token, LOCK_DURATION_MS)
      log(`Job ${job.id}: lock extended`)
    } catch (error) {
      log(`Job ${job.id}: lock extension failed - ${error.message}`)
    }
  }, LOCK_EXTEND_INTERVAL_MS)

  // Acquire in processor (not 'active' listener) so throwing fails the job;
  // must precede the first session_status patch to satisfy field-ownership.
  if (thread_id) {
    const machine_id = get_current_machine_id()
    if (!machine_id) {
      throw new Error(
        'lease_unavailable: cannot resolve current machine_id from machine_registry'
      )
    }
    const lease_result = await acquire_lease({
      thread_id,
      machine_id,
      session_id,
      ttl_ms: LEASE_TTL_MS,
      mode: 'session'
    })
    if (!lease_result?.acquired) {
      throw new Error(
        `lease_unavailable: thread ${thread_id} held by ${lease_result?.machine_id || 'unknown'}`
      )
    }
    await job.updateData({
      ...job.data,
      lease_token: lease_result.lease_token
    })
    log(
      `Job ${job.id}: acquired lease for ${thread_id} (token=${lease_result.lease_token})`
    )

    await update_thread_session_status({
      thread_id,
      session_status: 'starting'
    })
  }

  // Declared outside try/catch so the catch block can access them
  let claude_config_dir = null
  let selected_account = null

  try {
    try {
      selected_account = await select_account({
        execution_mode: execution_mode || 'host'
      })
      if (selected_account) {
        claude_config_dir = selected_account.config_dir
        log(
          `Job ${job.id}: using account %s (config_dir: %s)`,
          selected_account.namespace,
          claude_config_dir
        )
      }
    } catch (account_error) {
      if (account_error.name === 'AllAccountsExhaustedError') {
        // Delay job until earliest exhausted marker expires instead of
        // consuming a retry attempt (markers may have TTLs of hours).
        // Release the lease first: neither completion handler fires for
        // delayed jobs, so a held lease would block the retry.
        await release_lease_fallback(job)
        const delay_ms = await get_unavailable_delay_ms()
        log(`Job ${job.id}: all accounts exhausted, delaying %dms`, delay_ms)
        await job.moveToDelayed(Date.now() + delay_ms, job.token)
        // Return without result -- job will be re-processed after delay
        return
      }
      // Non-fatal: fall back to default account
      log(
        `Job ${job.id}: account selection failed, using default: %s`,
        account_error.message
      )
    }

    const result = await create_session_claude_cli({
      prompt,
      working_directory,
      user_public_key,
      session_id,
      thread_id,
      job_id: job.id,
      execution_mode,
      thread_config,
      username,
      claude_config_dir
    })

    log(`Job ${job.id}: completed (exit code ${result.exit_code})`)

    // create_session_claude_cli rejects on non-zero exit (stderr in error
    // message), so this path only runs on exit_code 0.
    return {
      success: true,
      session_directory: result.session_directory,
      session_id,
      exit_code: result.exit_code,
      completed_at: new Date().toISOString(),
      account_namespace: selected_account?.namespace || null
    }
  } catch (error) {
    if (selected_account) {
      // Check for authentication errors in stderr output first --
      // these need a distinct marker since they require manual re-auth
      // and should not be confused with rate-limit exhaustion
      if (is_cli_auth_error(error.message)) {
        log(
          `Job ${job.id}: authentication error detected for account %s`,
          selected_account.namespace
        )
        await handle_auth_failure({
          namespace: selected_account.namespace
        })
      } else {
        // Not an auth error -- check usage API to determine if this
        // was a rate-limit failure vs a generic error
        await check_and_mark_if_exhausted(job.id, selected_account)
      }
    }

    log(`Job ${job.id}: failed -`, error.message)
    throw error
  } finally {
    clearInterval(lock_interval)
  }
}

/**
 * Resolve all candidate host paths to a user-container's claude-home
 * directories.  When account rotation is enabled the JSONL written by
 * Claude lives under whichever account namespace was selected; the
 * fallback must search every configured account for this user, not just
 * the primary.
 *
 * Falls back to the primary claude-home when no rotation map is present
 * in the machine registry (single-account deployment).
 */
const get_user_container_account_homes = ({ username }) => {
  const machine_id = get_current_machine_id()
  const user_dirs =
    config.machine_registry?.[machine_id]?.claude_paths?.user_data_dirs?.[
      username
    ]
  if (user_dirs && Object.keys(user_dirs).length > 0) {
    return Object.values(user_dirs)
  }
  return [get_user_container_claude_home({ username })]
}

/**
 * Re-import session JSONL back to thread raw-data as a fallback
 * for when SessionEnd hooks fail (e.g., git lock contention).
 *
 * For container sessions, reads the updated JSONL from the container's
 * claude-home mount. For host sessions, reads from the host's projects dir.
 */
const sync_session_fallback = async (job, { override_session_id } = {}) => {
  const { thread_id, execution_mode, username } = job.data
  const session_id = override_session_id || job.data.session_id

  const execution_overrides =
    execution_mode === 'container_user'
      ? build_execution_attribution({ environment: 'controlled_container', username })
      : execution_mode === 'container'
        ? build_execution_attribution({
            environment: 'controlled_container',
            container_name: 'base-container'
          })
        : build_execution_attribution({ environment: 'controlled_host' })

  if (session_id && thread_id) {
    // Resume case or recovered session_id: import the specific session file
    await sync_session_fallback_by_file({
      job,
      execution_overrides,
      session_id
    })
  } else {
    // New session case: glob for all JSONL files in the projects directory
    await sync_session_fallback_by_glob(job, execution_overrides)
  }
}

/**
 * Import a specific session file (resume case where session_id is known)
 */
const sync_session_fallback_by_file = async ({
  job,
  execution_overrides,
  session_id
}) => {
  const { working_directory, execution_mode, username } = job.data

  try {
    let session_file
    if (execution_mode === 'container_user' && username) {
      const container_working_dir =
        translate_to_container_path(working_directory)
      const projects_dir_name = derive_projects_dir_name(container_working_dir)
      const candidates = get_user_container_account_homes({ username }).map(
        (home) =>
          join(home, 'projects', projects_dir_name, `${session_id}.jsonl`)
      )
      for (const candidate of candidates) {
        try {
          await access(candidate)
          session_file = candidate
          break
        } catch {
          /* try next account dir */
        }
      }
      if (!session_file) {
        log(
          `Job ${job.id}: session ${session_id} not found in any account dir for ${username}`
        )
        return
      }
    } else if (execution_mode === 'container') {
      const container_working_dir =
        translate_to_container_path(working_directory)
      const projects_dir_name = derive_projects_dir_name(container_working_dir)
      session_file = join(
        get_container_claude_home(),
        'projects',
        projects_dir_name,
        `${session_id}.jsonl`
      )
    } else {
      const projects_dir_name = derive_projects_dir_name(working_directory)
      session_file = join(
        homedir(),
        '.claude',
        'projects',
        projects_dir_name,
        `${session_id}.jsonl`
      )
    }

    await access(session_file)

    log(
      `Job ${job.id}: running post-session sync fallback from ${session_file}`
    )

    const sync_opts = {
      provider_name: 'claude',
      allow_updates: true,
      provider_options: {
        session_file
      },
      user_public_key: job.data.user_public_key,
      execution_overrides
    }

    // Pass known_thread_id to prevent duplicate creation via deterministic ID mismatch
    if (job.data.thread_id) {
      sync_opts.known_thread_id = job.data.thread_id
    }

    const result = await create_threads_from_session_provider(sync_opts)

    const updated = result.updated?.length || 0
    const created = result.created?.length || 0
    log(
      `Job ${job.id}: sync fallback complete (created: ${created}, updated: ${updated})`
    )
  } catch (error) {
    log(`Job ${job.id}: sync fallback failed - ${error.message}`)
  }
}

/**
 * Glob for JSONL files in the projects directory (new session case where session_id is null)
 * Handles deduplication via create_threads_from_session_provider's check_thread_exists
 */
const sync_session_fallback_by_glob = async (job, execution_overrides) => {
  const { working_directory, execution_mode, username } = job.data

  try {
    let projects_dirs
    if (execution_mode === 'container_user' && username) {
      const container_working_dir =
        translate_to_container_path(working_directory)
      const projects_dir_name = derive_projects_dir_name(container_working_dir)
      projects_dirs = get_user_container_account_homes({ username }).map(
        (home) => join(home, 'projects', projects_dir_name)
      )
    } else if (execution_mode === 'container') {
      const container_working_dir =
        translate_to_container_path(working_directory)
      const projects_dir_name = derive_projects_dir_name(container_working_dir)
      projects_dirs = [
        join(get_container_claude_home(), 'projects', projects_dir_name)
      ]
    } else {
      const projects_dir_name = derive_projects_dir_name(working_directory)
      projects_dirs = [join(homedir(), '.claude', 'projects', projects_dir_name)]
    }

    const jsonl_files = (
      await Promise.all(projects_dirs.map((d) => glob(join(d, '*.jsonl'))))
    ).flat()

    if (jsonl_files.length === 0) {
      log(
        `Job ${job.id}: no JSONL files found in ${projects_dirs.join(', ')}`
      )
      return
    }

    log(
      `Job ${job.id}: running post-session sync fallback (glob) - found ${jsonl_files.length} JSONL file(s) across ${projects_dirs.length} dir(s)`
    )

    let total_created = 0
    let total_updated = 0

    for (const session_file of jsonl_files) {
      try {
        const sync_opts = {
          provider_name: 'claude',
          allow_updates: true,
          provider_options: {
            session_file
          },
          user_public_key: job.data.user_public_key,
          execution_overrides
        }

        // Do NOT pass known_thread_id on the glob path: this loop processes
        // ALL JSONL files in the projects directory, not just the one for this
        // job.  Passing known_thread_id would import every session into the
        // pre-created thread.  Let each session create its own thread via the
        // deterministic ID path instead.

        const result = await create_threads_from_session_provider(sync_opts)

        total_created += result.created?.length || 0
        total_updated += result.updated?.length || 0
      } catch (file_error) {
        log(
          `Job ${job.id}: sync fallback failed for ${session_file} - ${file_error.message}`
        )
      }
    }

    log(
      `Job ${job.id}: sync fallback glob complete (created: ${total_created}, updated: ${total_updated})`
    )
  } catch (error) {
    log(`Job ${job.id}: sync fallback glob failed - ${error.message}`)
  }
}

/**
 * Event handlers
 */
const handle_job_completed = async (job, result) => {
  log(`Job ${job.id}: completed successfully`, result)

  // For thread-first sessions, recover session_id from thread metadata
  // (written by the session-status endpoint on SessionStart) so the
  // fallback can route to the file-based path instead of the glob path
  let override_session_id = null
  if (job.data.thread_id && !job.data.session_id) {
    try {
      const metadata = await read_thread_metadata(job.data.thread_id)
      override_session_id = metadata.external_session?.session_id || null
      if (override_session_id) {
        log(
          `Job ${job.id}: recovered session_id ${override_session_id} from thread metadata`
        )
      }
    } catch (error) {
      log(
        `Job ${job.id}: failed to recover session_id from thread metadata - ${error.message}`
      )
    }
  }

  // Re-import session as fallback for when SessionEnd hooks fail
  await sync_session_fallback(job, { override_session_id })

  await release_lease_fallback(job)

  // Queue immediate push-threads to reduce sync delay after session completion
  try {
    await add_cli_job({
      command:
        '$USER_BASE_DIRECTORY/repository/active/base/cli/push-threads.sh',
      tags: ['thread-sync'],
      priority: 5,
      timeout_ms: 120000
    })
    log(`Job ${job.id}: queued push-threads after session completion`)
  } catch (error) {
    log(`Job ${job.id}: failed to queue push-threads -`, error.message)
  }
}

const handle_job_failed = async (job, error) => {
  log(`Job ${job.id}: failed -`, error.message)

  // Update thread session_status to 'failed'. Marked terminal_lifecycle so
  // the field-ownership check exempts it: a job that failed to acquire a
  // lease cannot hold one, but the failure still needs to be recorded.
  if (job.data.thread_id) {
    await update_thread_session_status({
      thread_id: job.data.thread_id,
      session_status: 'failed',
      caller_flag: { terminal_lifecycle: true }
    })
  }

  emit_thread_job_failed({
    job_id: job.id,
    thread_id: job.data.thread_id,
    error_message: error.message
  }).catch((emit_error) => {
    log(`Job ${job.id}: failed to emit THREAD_JOB_FAILED -`, emit_error.message)
  })

  await release_lease_fallback(job)
}

const release_lease_fallback = async (job) => {
  const thread_id = job.data?.thread_id
  const lease_token = job.data?.lease_token
  if (!thread_id || lease_token == null) return
  try {
    await release_lease({ thread_id, lease_token })
    log(`Job ${job.id}: released lease for ${thread_id}`)
  } catch (error) {
    log(`Job ${job.id}: release lease fallback error - ${error.message}`)
  }
}

const handle_job_active = async (job) => {
  log(`Job ${job.id}: active`)
  if (job.data.thread_id) {
    // session_status='starting' patch is performed inside the processor
    // after acquire_lease to avoid the write-before-acquire race.
    emit_thread_job_started({
      job_id: job.id,
      thread_id: job.data.thread_id
    }).catch((err) => {
      log(`Job ${job.id}: failed to emit THREAD_JOB_STARTED - ${err.message}`)
    })
  }
}

const handle_worker_error = (error) => {
  log('Worker error:', error)
}

const handle_job_stalled = (job_id) => {
  log(`Job ${job_id}: stalled detected`)
}

/**
 * Start the BullMQ worker
 */
export const start_worker = () => {
  if (thread_worker) {
    log('Worker already running')
    return thread_worker
  }

  const connection = get_redis_connection()
  const concurrency =
    config.threads?.queue?.max_concurrent_jobs || DEFAULT_CONCURRENCY

  log(`Starting worker (concurrency: ${concurrency})`)

  thread_worker = new Worker(QUEUE_NAME, process_thread_creation_job, {
    connection,
    concurrency,
    // Long-running job protection: Claude CLI sessions run for 60+ minutes.
    // Without explicit config, BullMQ defaults to 30s lockDuration which causes
    // stall detection to re-queue jobs that are still running, spawning duplicates.
    lockDuration: LOCK_DURATION_MS,
    stalledInterval: STALLED_INTERVAL_MS,
    maxStalledCount: MAX_STALLED_COUNT
  })

  thread_worker.on('completed', handle_job_completed)
  thread_worker.on('failed', handle_job_failed)
  thread_worker.on('active', handle_job_active)
  thread_worker.on('error', handle_worker_error)
  thread_worker.on('stalled', handle_job_stalled)

  log('Worker ready')

  return thread_worker
}

/**
 * Stop the worker and close connections
 */
export const stop_worker = async () => {
  if (!thread_worker) {
    return
  }

  log('Stopping worker...')

  await thread_worker.close()
  thread_worker = null

  await close_redis_connection()

  log('Worker stopped')
}

// Exported for testing
export {
  sync_session_fallback_by_file,
  sync_session_fallback_by_glob,
  get_user_container_account_homes
}
