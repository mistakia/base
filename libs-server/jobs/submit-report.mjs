import os from 'os'
import debug from 'debug'
import config from '#config'

import { get_current_machine_id } from '#libs-server/schedule/machine-identity.mjs'
import { http_report_job } from '#libs-server/jobs/http-report-job.mjs'
import {
  buffer_report,
  drain_buffer
} from '#libs-server/jobs/job-report-buffer.mjs'

const log = debug('jobs:submit-report')

export const send_http_report = async ({ payload }) => {
  const api_url = config.job_tracker?.api_url
  const api_key = config.job_tracker?.api_key
  if (!api_url || !api_key) {
    log('HTTP report skipped: missing api_url or api_key in config')
    return
  }

  const http_result = await http_report_job({ api_url, api_key, payload })
  if (http_result.success) {
    drain_buffer({
      report_fn: (p) => http_report_job({ api_url, api_key, payload: p })
    }).catch((err) => log('Buffer drain error: %s', err.message))
  } else {
    log('HTTP report failed, buffering: %s', http_result.error)
    await buffer_report({ payload })
  }
}

/**
 * Submit a job report payload via the appropriate transport for this host:
 *   - On the storage server, call report_job() directly (lazy import to avoid
 *     pulling SSH and capability-registry modules into non-storage workers).
 *   - On every other host, POST to /api/jobs/report and buffer on failure.
 */
export const submit_job_report = async ({ payload }) => {
  if (get_current_machine_id() === 'storage') {
    const { report_job } = await import('#libs-server/jobs/report-job.mjs')
    return report_job(payload)
  }
  await send_http_report({ payload })
  return null
}

export const submit_deferred_report = async ({
  entity_id,
  title,
  schedule,
  schedule_type,
  base_uri,
  freshness_window_ms,
  missing
}) => {
  if (!entity_id) {
    log('submit_deferred_report skipped -- missing entity_id')
    return null
  }

  const payload = {
    job_id: `internal-${entity_id}`,
    name: title || entity_id,
    source: 'internal',
    project: 'base',
    server: os.hostname(),
    schedule: schedule || null,
    schedule_type: schedule_type || null,
    schedule_entity_id: entity_id,
    schedule_entity_uri: base_uri || null,
    status: 'deferred',
    deferred_missing: Array.isArray(missing) ? missing : [],
    freshness_window_ms: freshness_window_ms ?? null
  }

  return submit_job_report({ payload })
}
