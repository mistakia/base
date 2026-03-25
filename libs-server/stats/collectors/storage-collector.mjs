/**
 * Storage Metrics Collector
 *
 * Collects file counts, folder counts, directory sizes, database sizes,
 * and disk usage across local and remote machines.
 */

import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'

import config from '#config'
import { execute_shell_command } from '#libs-server/utils/execute-shell-command.mjs'
import { execute_ssh } from '#libs-server/database/storage-adapters/ssh-utils.mjs'

const log = debug('stats:collector:storage')

const EXCLUDE_PATTERN = '-not -path "*/.git/*" -not -path "*/node_modules/*" -not -name ".DS_Store" -not -path "*/__pycache__/*" -not -path "*/.yarn/*" -not -path "*/build/*" -not -path "*/tmp/*" -not -path "*/.next/*"'

async function count_files_and_folders({ dir_path, machine = 'macbook' }) {
  const run = machine === 'macbook'
    ? (cmd) => execute_shell_command(cmd, { timeout: 30000 })
    : (cmd) => execute_ssh('storage', cmd, { timeout: 30000 }).then(stdout => ({ stdout }))

  try {
    const [files_result, folders_result, size_result] = await Promise.all([
      run(`find "${dir_path}" -type f ${EXCLUDE_PATTERN} 2>/dev/null | wc -l`),
      run(`find "${dir_path}" -type d ${EXCLUDE_PATTERN} 2>/dev/null | wc -l`),
      run(machine === 'macbook'
        ? `du -sk "${dir_path}" 2>/dev/null | cut -f1`
        : `du -sb "${dir_path}" 2>/dev/null | cut -f1`)
    ])

    const raw_size = parseInt(size_result.stdout.trim(), 10) || 0
    // macOS du -sk returns kilobytes, Linux du -sb returns bytes
    const size_bytes = machine === 'macbook' ? raw_size * 1024 : raw_size

    return {
      file_count: parseInt(files_result.stdout.trim(), 10) || 0,
      folder_count: parseInt(folders_result.stdout.trim(), 10) || 0,
      directory_size: size_bytes
    }
  } catch (err) {
    log('Failed to count %s on %s: %s', dir_path, machine, err.message)
    return null
  }
}

async function collect_directory_metrics({ snapshot_date, dir_path, label, machine }) {
  const stats = await count_files_and_folders({ dir_path, machine })
  if (!stats) return []

  const dims = { machine, path: label }
  return [
    { snapshot_date, category: 'storage', metric_name: 'file_count', metric_value: stats.file_count, unit: 'count', dimensions: dims },
    { snapshot_date, category: 'storage', metric_name: 'folder_count', metric_value: stats.folder_count, unit: 'count', dimensions: dims },
    { snapshot_date, category: 'storage', metric_name: 'directory_size', metric_value: stats.directory_size, unit: 'bytes', dimensions: dims }
  ]
}

async function collect_database_sizes({ snapshot_date, pool }) {
  const metrics = []
  const databases = ['finance_production', 'nanodb_production', 'parcels_production', 'epstein_transparency_act', 'stats_production']

  for (const db_name of databases) {
    try {
      const result = await pool.query('SELECT pg_database_size($1) as size', [db_name])
      metrics.push({
        snapshot_date,
        category: 'storage',
        metric_name: 'database_size',
        metric_value: Number(result.rows[0]?.size || 0),
        unit: 'bytes',
        dimensions: { database: db_name }
      })
    } catch (err) {
      log('Failed to get size for %s: %s', db_name, err.message)
    }
  }
  return metrics
}

async function collect_disk_usage({ snapshot_date, machine }) {
  const metrics = []
  try {
    const run = machine === 'macbook'
      ? (cmd) => execute_shell_command(cmd, { timeout: 10000 })
      : (cmd) => execute_ssh('storage', cmd, { timeout: 10000 }).then(stdout => ({ stdout }))

    const df_cmd = process.platform === 'darwin' && machine === 'macbook'
      ? 'df -k / | tail -1'
      : 'df -B1 / | tail -1'

    const { stdout } = await run(df_cmd)
    const parts = stdout.trim().split(/\s+/)

    if (parts.length >= 4) {
      const multiplier = process.platform === 'darwin' && machine === 'macbook' ? 1024 : 1
      metrics.push({
        snapshot_date,
        category: 'storage',
        metric_name: 'disk_usage',
        metric_value: parseInt(parts[2], 10) * multiplier,
        unit: 'bytes',
        dimensions: { machine, mount: '/' }
      })
      metrics.push({
        snapshot_date,
        category: 'storage',
        metric_name: 'disk_available',
        metric_value: parseInt(parts[3], 10) * multiplier,
        unit: 'bytes',
        dimensions: { machine, mount: '/' }
      })
    }
  } catch (err) {
    log('Failed to collect disk usage for %s: %s', machine, err.message)
  }
  return metrics
}

export async function collect_storage_metrics({ snapshot_date, pool }) {
  const metrics = []
  const user_base = config.user_base_directory

  // Local directories
  const local_dirs = [
    { path: user_base, label: 'user-base' }
  ]

  // Add active repos
  const active_path = path.join(user_base, 'repository', 'active')
  try {
    const entries = await fs.readdir(active_path, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.endsWith('-worktrees') && !entry.name.startsWith('.')) {
        local_dirs.push({
          path: path.join(active_path, entry.name),
          label: `repository/active/${entry.name}`
        })
      }
    }
  } catch {
    // skip
  }

  // Collect local directory metrics
  const local_promises = local_dirs.map(d =>
    collect_directory_metrics({ snapshot_date, dir_path: d.path, label: d.label, machine: 'macbook' })
  )

  // Collect remote directory metrics (storage server user-base)
  const remote_promises = [
    collect_directory_metrics({
      snapshot_date,
      dir_path: '/mnt/md0/user-base',
      label: 'user-base',
      machine: 'storage'
    })
  ]

  const results = await Promise.allSettled([...local_promises, ...remote_promises])
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      metrics.push(...r.value)
    }
  }

  // Database sizes (requires the stats pool which can query pg_database_size)
  if (pool) {
    const db_metrics = await collect_database_sizes({ snapshot_date, pool })
    metrics.push(...db_metrics)
  }

  // Disk usage
  const [local_disk, remote_disk] = await Promise.allSettled([
    collect_disk_usage({ snapshot_date, machine: 'macbook' }),
    collect_disk_usage({ snapshot_date, machine: 'storage' })
  ])
  if (local_disk.status === 'fulfilled') metrics.push(...local_disk.value)
  if (remote_disk.status === 'fulfilled') metrics.push(...remote_disk.value)

  log('Collected %d storage metrics', metrics.length)
  return metrics
}
