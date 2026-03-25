/**
 * Service Metrics Collector
 *
 * Collects PM2 service status, uptime, and restart counts from both machines.
 */

import debug from 'debug'

import { execute_shell_command } from '#libs-server/utils/execute-shell-command.mjs'
import { execute_ssh } from '#libs-server/database/storage-adapters/ssh-utils.mjs'

const log = debug('stats:collector:service')

async function collect_pm2_metrics({ snapshot_date, machine }) {
  const metrics = []

  try {
    let raw
    if (machine === 'macbook') {
      const { stdout } = await execute_shell_command('pm2 jlist', { timeout: 10000 })
      raw = stdout
    } else {
      raw = await execute_ssh('storage', 'pm2 jlist', { timeout: 10000 })
    }

    const services = JSON.parse(raw)

    for (const svc of services) {
      const dims = { service: svc.name, machine }
      const status_value = svc.pm2_env?.status === 'online' ? 1 : 0
      const uptime_ms = svc.pm2_env?.pm_uptime
        ? Date.now() - svc.pm2_env.pm_uptime
        : 0
      const restarts = svc.pm2_env?.restart_time || 0

      metrics.push({
        snapshot_date,
        category: 'services',
        metric_name: 'service_status',
        metric_value: status_value,
        unit: 'boolean',
        dimensions: dims
      })
      metrics.push({
        snapshot_date,
        category: 'services',
        metric_name: 'service_uptime',
        metric_value: Math.round(uptime_ms / 1000),
        unit: 'seconds',
        dimensions: dims
      })
      metrics.push({
        snapshot_date,
        category: 'services',
        metric_name: 'service_restarts',
        metric_value: restarts,
        unit: 'count',
        dimensions: dims
      })
    }
  } catch (err) {
    log('Failed to collect PM2 metrics for %s: %s', machine, err.message)
  }

  return metrics
}

export async function collect_service_metrics({ snapshot_date }) {
  const [local, remote] = await Promise.allSettled([
    collect_pm2_metrics({ snapshot_date, machine: 'macbook' }),
    collect_pm2_metrics({ snapshot_date, machine: 'storage' })
  ])

  const metrics = []
  if (local.status === 'fulfilled') metrics.push(...local.value)
  if (remote.status === 'fulfilled') metrics.push(...remote.value)

  log('Collected %d service metrics', metrics.length)
  return metrics
}
