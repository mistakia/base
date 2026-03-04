import debug from 'debug'

const log = debug('jobs:discord')

/**
 * Send a Discord webhook notification for a job failure
 *
 * @param {Object} params
 * @param {string} params.job_id - Job identifier
 * @param {string} params.name - Job name / schedule title
 * @param {string} params.source - 'internal' or 'external'
 * @param {string} params.project - Project name
 * @param {string} params.server - Server hostname
 * @param {string} params.reason - Failure reason
 * @param {number} [params.duration_ms] - Execution duration in milliseconds
 * @param {number} [params.exit_code] - Process exit code
 * @param {string} params.discord_webhook_url - Discord webhook URL
 */
export const notify_job_failure = async ({
  job_id,
  name,
  source,
  project,
  server,
  reason,
  duration_ms,
  exit_code,
  schedule,
  schedule_entity_uri,
  command,
  discord_webhook_url
}) => {
  if (!discord_webhook_url) {
    return
  }

  const display_name = name && name !== job_id ? name : null
  const title = display_name
    ? `Job Failed: ${display_name}`
    : `Job Failed: ${job_id}`

  const fields = [
    { name: 'Source', value: source || 'unknown', inline: true },
    { name: 'Project', value: project || 'unknown', inline: true },
    { name: 'Server', value: server || 'unknown', inline: true }
  ]

  if (schedule) {
    fields.push({ name: 'Schedule', value: schedule, inline: true })
  }

  if (duration_ms != null) {
    const duration_str = duration_ms >= 60000
      ? `${(duration_ms / 60000).toFixed(1)}m`
      : `${(duration_ms / 1000).toFixed(1)}s`
    fields.push({ name: 'Duration', value: duration_str, inline: true })
  }

  if (exit_code != null) {
    fields.push({ name: 'Exit Code', value: String(exit_code), inline: true })
  }

  if (schedule_entity_uri) {
    fields.push({ name: 'Entity', value: schedule_entity_uri, inline: true })
  }

  if (command) {
    fields.push({ name: 'Command', value: command.slice(0, 200), inline: false })
  }

  fields.push({ name: 'Reason', value: reason || 'No reason provided' })

  if (display_name) {
    fields.push({ name: 'Job ID', value: job_id, inline: false })
  }

  const payload = {
    embeds: [
      {
        title,
        color: 15548997,
        fields,
        timestamp: new Date().toISOString()
      }
    ]
  }

  try {
    const response = await fetch(discord_webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000)
    })

    if (!response.ok) {
      log('Discord notification failed: %d %s', response.status, response.statusText)
    }
  } catch (error) {
    log('Discord notification error: %s', error.message)
  }
}

/**
 * Send a Discord webhook notification for a missed job execution
 *
 * @param {Object} params
 * @param {string} params.job_id - Job identifier
 * @param {string} params.source - 'internal' or 'external'
 * @param {string} params.project - Project name
 * @param {string} params.schedule - Cron expression or interval
 * @param {string} params.last_execution_timestamp - ISO 8601 timestamp of last run
 * @param {string} params.discord_webhook_url - Discord webhook URL
 */
export const notify_missed_job = async ({
  job_id,
  name,
  source,
  project,
  schedule,
  last_execution_timestamp,
  discord_webhook_url
}) => {
  if (!discord_webhook_url) {
    return
  }

  const display_name = name && name !== job_id ? name : null
  const title = display_name
    ? `Missed Execution: ${display_name}`
    : `Missed Execution: ${job_id}`

  const fields = [
    { name: 'Source', value: source || 'unknown', inline: true },
    { name: 'Project', value: project || 'unknown', inline: true },
    { name: 'Schedule', value: schedule || 'unknown', inline: true },
    { name: 'Last Run', value: last_execution_timestamp || 'Never' }
  ]

  if (display_name) {
    fields.push({ name: 'Job ID', value: job_id, inline: false })
  }

  const payload = {
    embeds: [
      {
        title,
        color: 16776960,
        fields,
        timestamp: new Date().toISOString()
      }
    ]
  }

  try {
    const response = await fetch(discord_webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000)
    })

    if (!response.ok) {
      log('Discord missed-job notification failed: %d', response.status)
    }
  } catch (error) {
    log('Discord missed-job notification error: %s', error.message)
  }
}
