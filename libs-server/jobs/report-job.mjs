import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'
import config from '#config'

import { get_current_machine_id } from '#libs-server/schedule/machine-identity.mjs'
import { execute_ssh } from '#libs-server/database/storage-adapters/ssh-utils.mjs'
import { get_all } from '#libs-server/extension/capability-registry.mjs'
import { parse_interval_ms } from './job-utils.mjs'

const log = debug('jobs:report')

const MAX_FAILURE_HISTORY = 50
const MAX_DISCORD_MESSAGE_IDS = 20
const BASE_SUPPRESSION_WINDOW_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Exponential backoff on alert suppression window based on consecutive failures.
 * Reduces noise from persistently failing jobs.
 */
const get_suppression_window_ms = (consecutive_failures) => {
  if (consecutive_failures <= 2) return 5 * 60 * 1000 // 5 min
  if (consecutive_failures <= 5) return 60 * 60 * 1000 // 1 hour
  if (consecutive_failures <= 10) return 4 * 60 * 60 * 1000 // 4 hours
  return 12 * 60 * 60 * 1000 // 12 hours max
}

/**
 * Calculate the consecutive failure threshold before alerting.
 * For high-frequency "every" schedules (interval < 5 minutes), require enough
 * consecutive failures to span ~5 minutes. All other schedules alert on first failure.
 */
const get_alert_threshold = ({ schedule, schedule_type }) => {
  if (schedule_type !== 'every') {
    return 1
  }

  const interval_ms = parse_interval_ms(schedule)
  if (!interval_ms || interval_ms >= BASE_SUPPRESSION_WINDOW_MS) {
    return 1
  }

  return Math.ceil(BASE_SUPPRESSION_WINDOW_MS / interval_ms)
}

/**
 * Determine whether job files are accessed locally or via SSH.
 * Local when running on storage server or when path exists on the local filesystem.
 */
const is_local = async () => {
  const machine_id = get_current_machine_id()
  if (machine_id === 'storage') {
    return true
  }

  // Check if path exists locally (handles test environments and local paths)
  const job_dir = config.job_tracker?.path
  if (job_dir) {
    try {
      await fs.access(job_dir)
      return true
    } catch {
      return false
    }
  }

  return false
}

const get_job_path = () => config.job_tracker?.path || ''
const get_ssh_host = () => config.job_tracker?.ssh_host || 'storage'

/**
 * Load a single job file by ID
 *
 * @param {Object} params
 * @param {string} params.job_id - Job identifier
 * @returns {Object|null} Job data or null if not found
 */
export const load_job = async ({ job_id }) => {
  const job_dir = get_job_path()
  if (!job_dir) {
    return null
  }

  const file_path = path.join(job_dir, `${job_id}.json`)

  try {
    if (await is_local()) {
      const content = await fs.readFile(file_path, 'utf-8')
      return JSON.parse(content)
    }

    const content = await execute_ssh(get_ssh_host(), `cat ${file_path}`)
    return JSON.parse(content)
  } catch (error) {
    if (error.code === 'ENOENT' || error.message?.includes('No such file')) {
      return null
    }
    log('Error loading job %s: %s', job_id, error.message)
    throw error
  }
}

/**
 * Load all job files from the job directory
 *
 * @returns {Array<Object>} Array of job data objects
 */
export const load_all_jobs = async () => {
  const job_dir = get_job_path()
  if (!job_dir) {
    return []
  }

  try {
    let file_list

    if (await is_local()) {
      const entries = await fs.readdir(job_dir)
      file_list = entries.filter((f) => f.endsWith('.json'))
    } else {
      const output = await execute_ssh(
        get_ssh_host(),
        `ls ${job_dir}/*.json 2>/dev/null || true`
      )
      file_list = output
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((f) => path.basename(f))
    }

    const jobs = []
    for (const file_name of file_list) {
      try {
        const job_id = file_name.replace('.json', '')
        const job = await load_job({ job_id })
        if (job) {
          jobs.push(job)
        }
      } catch (error) {
        log('Error loading job file %s: %s', file_name, error.message)
      }
    }

    return jobs
  } catch (error) {
    log('Error loading all jobs: %s', error.message)
    return []
  }
}

/**
 * Save a job file atomically (temp file + rename)
 * Only called on storage server where API runs
 */
const save_job = async ({ job_id, data }) => {
  const job_dir = get_job_path()
  const file_path = path.join(job_dir, `${job_id}.json`)
  const tmp_path = `${file_path}.tmp`

  await fs.writeFile(tmp_path, JSON.stringify(data, null, 2) + '\n', 'utf-8')
  await fs.rename(tmp_path, file_path)
}

/**
 * Create a new job object with defaults
 */
const create_job = ({
  job_id,
  name,
  source,
  project,
  server,
  schedule,
  schedule_type,
  schedule_entity_id
}) => {
  const now = new Date().toISOString()
  return {
    job_id,
    name: name || job_id,
    source: source || 'external',
    project: project || null,
    server: server || null,
    schedule: schedule || null,
    schedule_type: schedule_type || null,
    schedule_entity_id: schedule_entity_id || null,
    consecutive_failures: 0,
    last_execution: null,
    failure_history: [],
    discord_message_ids: [],
    stats: {
      total_runs: 0,
      success_count: 0,
      failure_count: 0,
      last_success: null,
      last_failure: null
    },
    last_alerted_at: null,
    created_at: now,
    updated_at: now
  }
}

/**
 * Report a job execution result
 *
 * @param {Object} params
 * @param {string} params.job_id - Job identifier
 * @param {string} [params.name] - Human-readable job name
 * @param {string} [params.source] - 'internal' or 'external'
 * @param {boolean} params.success - Whether execution succeeded
 * @param {string} [params.reason] - Failure reason
 * @param {number} [params.duration_ms] - Execution duration in ms
 * @param {number} [params.exit_code] - Process exit code
 * @param {string} [params.project] - Project name
 * @param {string} [params.server] - Server hostname
 * @param {string} [params.schedule] - Cron expression or interval
 * @param {string} [params.schedule_type] - 'expr' or 'every'
 * @param {string} [params.schedule_entity_id] - Schedule entity UUID
 * @returns {Object} Updated job data
 */
export const report_job = async ({
  job_id,
  name,
  source,
  success,
  status,
  reason,
  duration_ms,
  exit_code,
  project,
  server,
  schedule,
  schedule_type,
  schedule_entity_id,
  schedule_entity_uri,
  command,
  cleanup_alerts_on_success,
  deferred_missing,
  freshness_window_ms
}) => {
  const now = new Date().toISOString()
  const is_deferred = status === 'deferred'

  let job = await load_job({ job_id })
  const is_new = !job

  if (is_new) {
    job = create_job({
      job_id,
      name,
      source,
      project,
      server,
      schedule,
      schedule_type,
      schedule_entity_id
    })
  }

  // Update mutable fields if provided
  if (name) job.name = name
  if (schedule) job.schedule = schedule
  if (schedule_type) job.schedule_type = schedule_type
  if (schedule_entity_id) job.schedule_entity_id = schedule_entity_id
  if (server) job.server = server
  if (cleanup_alerts_on_success != null) {
    job.cleanup_alerts_on_success = cleanup_alerts_on_success
  }

  // Persist freshness window cache when provided so check-missed-jobs can read
  // it without loading schedule entities.
  if (typeof freshness_window_ms === 'number') {
    job.freshness_window_ms = freshness_window_ms
  }

  // Deferred status is fully separate from success/failure accounting --
  // record the defer and short-circuit before touching last_execution, stats,
  // failure_history, or the alert paths.
  if (is_deferred) {
    job.last_deferred_at = now
    job.deferred_missing = Array.isArray(deferred_missing)
      ? deferred_missing
      : []
    job.updated_at = now
    await save_job({ job_id, data: job })
    log(
      'Reported job %s: deferred missing=%s is_new=%s',
      job_id,
      job.deferred_missing.join(','),
      is_new
    )
    return job
  }

  // Update last execution
  job.last_execution = {
    timestamp: now,
    success,
    duration_ms: duration_ms ?? null,
    exit_code: exit_code ?? null,
    reason: success ? null : reason || null
  }

  // Guard fields for job files created before these arrays were added
  if (!Array.isArray(job.failure_history)) {
    job.failure_history = []
  }
  if (!Array.isArray(job.discord_message_ids)) {
    job.discord_message_ids = []
  }

  // Update stats
  job.stats.total_runs += 1
  if (success) {
    job.stats.success_count += 1
    job.stats.last_success = now

    // Clean up previous failure alerts on recovery (fire and forget).
    // Only for jobs with cleanup_alerts_on_success enabled -- health checks and
    // monitors where recovery confirms resolution. Jobs where failure history
    // matters for investigation (imports, backups) should leave alerts for triage.
    if (job.cleanup_alerts_on_success && job.discord_message_ids.length > 0) {
      for (const channel of get_all('notification-channel')) {
        channel
          .notify_recovery({
            job_id,
            previous_alert_ids: [...job.discord_message_ids]
          })
          .catch((error) => log('Alert cleanup error: %s', error.message))
      }
    }
    job.discord_message_ids = []

    job.consecutive_failures = 0
    job.last_alerted_at = null
  } else {
    job.stats.failure_count += 1
    job.stats.last_failure = now
    job.consecutive_failures = (job.consecutive_failures || 0) + 1

    // Append to failure history
    job.failure_history.push({
      timestamp: now,
      reason: reason || null,
      duration_ms: duration_ms ?? null,
      exit_code: exit_code ?? null
    })

    // Trim to max size
    if (job.failure_history.length > MAX_FAILURE_HISTORY) {
      job.failure_history = job.failure_history.slice(-MAX_FAILURE_HISTORY)
    }
  }

  job.updated_at = now

  // Determine whether to send a failure notification before saving
  let should_notify = false
  if (!success) {
    const threshold = get_alert_threshold({
      schedule: job.schedule,
      schedule_type: job.schedule_type
    })

    const meets_threshold = job.consecutive_failures >= threshold
    const cooldown_elapsed =
      !job.last_alerted_at ||
      new Date(now).getTime() - new Date(job.last_alerted_at).getTime() >=
        get_suppression_window_ms(job.consecutive_failures)

    should_notify = meets_threshold && cooldown_elapsed
  }

  // Send notification before save so we only set last_alerted_at on actual delivery
  if (should_notify) {
    const channels = get_all('notification-channel')
    const results = await Promise.allSettled(
      channels.map((channel) =>
        channel.notify_failure({
          job_id,
          name: job.name,
          source: job.source,
          project: job.project,
          server: job.server,
          reason,
          duration_ms,
          exit_code,
          schedule: job.schedule,
          schedule_entity_uri,
          command,
          consecutive_failures: job.consecutive_failures
        })
      )
    )

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        job.last_alerted_at = now
        job.discord_message_ids.push(result.value)
      } else if (result.status === 'rejected') {
        log('Notification error: %s', result.reason?.message)
      }
    }

    if (job.discord_message_ids.length > MAX_DISCORD_MESSAGE_IDS) {
      job.discord_message_ids = job.discord_message_ids.slice(
        -MAX_DISCORD_MESSAGE_IDS
      )
    }
  }

  await save_job({ job_id, data: job })

  log('Reported job %s: success=%s is_new=%s', job_id, success, is_new)

  return job
}

/**
 * Save job data directly (used by check-missed-jobs to update last_alerted_at)
 */
export { save_job }
