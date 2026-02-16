/**
 * Google Drive Collector
 *
 * Scans Google Drive via rclone lsjson to index files and compute folder statistics.
 * Generates gdrive://remote/path base URIs.
 */

import { spawn } from 'child_process'
import path from 'path'

/**
 * Scan Google Drive via rclone
 *
 * @param {Object} options
 * @param {string} [options.path] - Subdirectory to scan (e.g., "documents")
 * @param {string[]} [options.exclude] - Patterns to exclude
 * @param {number} [options.max_depth] - Maximum directory depth
 * @returns {Object} { files: Array, folders: Array }
 */
export async function scan({ path: scan_path, exclude = [], max_depth } = {}) {
  // Discover rclone remote name
  const remote = await get_gdrive_remote()
  const remote_label = remote.replace(/^google_drive_/, '')

  const rclone_path = scan_path ? `${remote}:${scan_path}` : `${remote}:`
  const now = new Date().toISOString()

  console.log(`rclone lsjson ${rclone_path} ...`)

  const entries = await run_rclone_lsjson({
    rclone_path,
    max_depth,
    exclude
  })

  console.log(`Received ${entries.length} entries from rclone`)

  // Parse into files and folders
  return parse_entries({
    entries,
    remote_label,
    base_path: scan_path || '',
    scanned_at: now
  })
}

/**
 * Find the Google Drive rclone remote
 */
async function get_gdrive_remote() {
  const output = await run_command('rclone', ['listremotes'])
  const remotes = output
    .trim()
    .split('\n')
    .map((r) => r.replace(/:$/, ''))

  const gdrive = remotes.find(
    (r) => r.includes('google_drive') || r.includes('gdrive')
  )
  if (!gdrive) {
    throw new Error(
      `No Google Drive rclone remote found. Available: ${remotes.join(', ')}`
    )
  }
  return gdrive
}

/**
 * Run rclone lsjson and parse JSON output
 */
async function run_rclone_lsjson({ rclone_path, max_depth, exclude }) {
  const args = ['lsjson', '--recursive', rclone_path]

  if (max_depth != null) {
    args.push('--max-depth', String(max_depth))
  }

  for (const pattern of exclude) {
    args.push('--exclude', pattern)
  }

  const output = await run_command('rclone', args)

  try {
    return JSON.parse(output)
  } catch {
    throw new Error('Failed to parse rclone lsjson output as JSON')
  }
}

/**
 * Parse rclone lsjson entries into files and folders arrays
 */
function parse_entries({ entries, remote_label, base_path, scanned_at }) {
  const files = []
  const folder_stats = new Map() // dir_path -> stats
  const all_dirs = new Set()

  // Always include the root scan directory
  const root_path = base_path || ''
  all_dirs.add(root_path)

  for (const entry of entries) {
    const entry_path = base_path ? `${base_path}/${entry.Path}` : entry.Path

    if (entry.IsDir) {
      all_dirs.add(entry_path)

      // Track as subfolder of parent
      const parent = get_parent_path(entry_path)
      ensure_stats(folder_stats, parent)
      folder_stats.get(parent).subfolder_count++
    } else {
      // File entry
      const size = entry.Size === -1 ? 0 : entry.Size
      const base_uri = `gdrive://${remote_label}/${entry_path}`

      files.push({
        base_uri,
        name: entry.Name,
        mime_type: entry.MimeType || null,
        size,
        modified_at: entry.ModTime || null,
        source: 'gdrive',
        cid: null,
        scanned_at
      })

      // Accumulate folder stats
      const parent = get_parent_path(entry_path)
      ensure_stats(folder_stats, parent)
      const stats = folder_stats.get(parent)
      stats.file_count++
      stats.total_size += size

      if (entry.ModTime) {
        const mtime = new Date(entry.ModTime)
        if (!stats.latest_mtime || mtime > stats.latest_mtime) {
          stats.latest_mtime = mtime
        }
      }
    }
  }

  // Propagate subtree stats bottom-up (O(n) instead of O(n^2))
  // Sort dirs by depth (deepest first); root ('') has depth 0
  const sorted_dirs = Array.from(all_dirs).sort((a, b) => {
    const depth_a = a ? a.split('/').length : 0
    const depth_b = b ? b.split('/').length : 0
    return depth_b - depth_a
  })

  // Initialize aggregated stats
  const agg = new Map()
  for (const dir_path of sorted_dirs) {
    const stats = folder_stats.get(dir_path) || {
      total_size: 0,
      latest_mtime: null
    }
    agg.set(dir_path, {
      total_size: stats.total_size,
      deepest_depth: 0,
      latest_mtime: stats.latest_mtime
    })
  }

  // Propagate child stats to parents
  for (const dir_path of sorted_dirs) {
    const parent = get_parent_path(dir_path)
    if (parent === dir_path || !agg.has(parent)) continue

    const child_agg = agg.get(dir_path)
    const parent_agg = agg.get(parent)

    parent_agg.total_size += child_agg.total_size
    if (child_agg.deepest_depth + 1 > parent_agg.deepest_depth) {
      parent_agg.deepest_depth = child_agg.deepest_depth + 1
    }
    if (
      child_agg.latest_mtime &&
      (!parent_agg.latest_mtime ||
        child_agg.latest_mtime > parent_agg.latest_mtime)
    ) {
      parent_agg.latest_mtime = child_agg.latest_mtime
    }
  }

  // Build folder records
  const folders = []
  for (const dir_path of all_dirs) {
    const stats = folder_stats.get(dir_path) || {
      file_count: 0,
      subfolder_count: 0
    }
    const aggregated = agg.get(dir_path)
    const folder_name = dir_path ? path.basename(dir_path) : remote_label
    const uri_path = dir_path ? `${dir_path}/` : ''

    folders.push({
      base_uri: `gdrive://${remote_label}/${uri_path}`,
      folder_name,
      file_count: stats.file_count,
      subfolder_count: stats.subfolder_count,
      total_size: aggregated.total_size,
      deepest_depth: aggregated.deepest_depth,
      modified_at: aggregated.latest_mtime
        ? aggregated.latest_mtime.toISOString()
        : null,
      scanned_at
    })
  }

  return { files, folders }
}

function get_parent_path(file_path) {
  const idx = file_path.lastIndexOf('/')
  return idx === -1 ? '' : file_path.slice(0, idx)
}

function ensure_stats(folder_stats, dir_path) {
  if (!folder_stats.has(dir_path)) {
    folder_stats.set(dir_path, {
      file_count: 0,
      subfolder_count: 0,
      total_size: 0,
      latest_mtime: null
    })
  }
}

function run_command(cmd, args) {
  return new Promise((resolve, reject) => {
    const chunks = []
    const stderr_chunks = []

    const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })

    proc.stdout.on('data', (chunk) => chunks.push(chunk))
    proc.stderr.on('data', (chunk) => stderr_chunks.push(chunk))

    proc.on('close', (code) => {
      const output = Buffer.concat(chunks).toString('utf-8')
      const stderr = Buffer.concat(stderr_chunks).toString('utf-8')

      if (code !== 0) {
        reject(
          new Error(`${cmd} failed (exit ${code}): ${stderr.slice(0, 500)}`)
        )
        return
      }

      resolve(output)
    })

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn ${cmd}: ${err.message}`))
    })
  })
}
