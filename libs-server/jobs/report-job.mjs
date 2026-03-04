import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'
import config from '#config'

import { get_current_machine_id } from '#libs-server/schedule/machine-identity.mjs'
import { execute_ssh } from '#libs-server/database/storage-adapters/ssh-utils.mjs'
import { notify_job_failure } from './notify-discord.mjs'

const log = debug('jobs:report')

const MAX_FAILURE_HISTORY = 50

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
const create_job = ({ job_id, name, source, project, server, schedule, schedule_type, schedule_entity_id }) => {
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
    last_execution: null,
    failure_history: [],
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
  reason,
  duration_ms,
  exit_code,
  project,
  server,
  schedule,
  schedule_type,
  schedule_entity_id
}) => {
  const now = new Date().toISOString()

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

  // Update last execution
  job.last_execution = {
    timestamp: now,
    success,
    duration_ms: duration_ms ?? null,
    exit_code: exit_code ?? null,
    reason: success ? null : (reason || null)
  }

  // Update stats
  job.stats.total_runs += 1
  if (success) {
    job.stats.success_count += 1
    job.stats.last_success = now
    job.last_alerted_at = null
  } else {
    job.stats.failure_count += 1
    job.stats.last_failure = now

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

  await save_job({ job_id, data: job })

  // Notify on failure
  if (!success) {
    try {
      await notify_job_failure({
        job_id,
        name: job.name,
        source: job.source,
        project: job.project,
        server: job.server,
        reason,
        duration_ms,
        exit_code,
        schedule: job.schedule,
        discord_webhook_url: config.job_tracker?.discord_webhook_url
      })
    } catch (error) {
      log('Discord notification error: %s', error.message)
    }
  }

  log('Reported job %s: success=%s is_new=%s', job_id, success, is_new)

  return job
}

/**
 * Save job data directly (used by check-missed-jobs to update last_alerted_at)
 */
export { save_job }
