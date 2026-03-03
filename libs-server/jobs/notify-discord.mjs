import debug from 'debug'

const log = debug('jobs:discord')

/**
 * Send a Discord webhook notification for a job failure
 *
 * @param {Object} params
 * @param {string} params.job_id - Job identifier
 * @param {string} params.source - 'internal' or 'external'
 * @param {string} params.project - Project name
 * @param {string} params.server - Server hostname
 * @param {string} params.reason - Failure reason
 * @param {string} params.discord_webhook_url - Discord webhook URL
 */
export const notify_job_failure = async ({
  job_id,
  source,
  project,
  server,
  reason,
  discord_webhook_url
}) => {
  if (!discord_webhook_url) {
    return
  }

  const payload = {
    embeds: [
      {
        title: `Job Failed: ${job_id}`,
        color: 15548997,
        fields: [
          { name: 'Source', value: source || 'unknown', inline: true },
          { name: 'Project', value: project || 'unknown', inline: true },
          { name: 'Server', value: server || 'unknown', inline: true },
          { name: 'Reason', value: reason || 'No reason provided' }
        ],
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
  source,
  project,
  schedule,
  last_execution_timestamp,
  discord_webhook_url
}) => {
  if (!discord_webhook_url) {
    return
  }

  const payload = {
    embeds: [
      {
        title: `Missed Execution: ${job_id}`,
        color: 16776960,
        fields: [
          { name: 'Source', value: source || 'unknown', inline: true },
          { name: 'Project', value: project || 'unknown', inline: true },
          { name: 'Schedule', value: schedule || 'unknown', inline: true },
          {
            name: 'Last Run',
            value: last_execution_timestamp || 'Never'
          }
        ],
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
