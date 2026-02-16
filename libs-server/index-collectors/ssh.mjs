/**
 * SSH Filesystem Collector
 *
 * Scans remote filesystems via SSH to index files and compute folder statistics.
 * Uses `find -printf` for efficient single-pass metadata collection.
 * Generates ssh://host/path base URIs.
 */

import { spawn } from 'child_process'
import path from 'path'

const DEFAULT_EXCLUDES = [
  '.git',
  '.DS_Store',
  'node_modules',
  '.Trash',
  '.cache',
  '__pycache__',
  '.venv',
  'venv',
  'lost+found'
]

// Reuse MIME type map from local collector
const MIME_TYPES = {
  '.pdf': 'application/pdf',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.zip': 'application/zip',
  '.gz': 'application/gzip',
  '.tar': 'application/x-tar',
  '.7z': 'application/x-7z-compressed',
  '.rar': 'application/vnd.rar',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.csv': 'text/csv',
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.ts': 'text/typescript',
  '.py': 'text/x-python',
  '.sh': 'text/x-shellscript',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.mp4': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.doc': 'application/msword',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.sql': 'application/sql',
  '.db': 'application/x-sqlite3',
  '.duckdb': 'application/x-duckdb',
  '.parquet': 'application/x-parquet',
  '.log': 'text/plain'
}

/**
 * Scan remote filesystem via SSH
 *
 * @param {Object} options
 * @param {string} options.path - Remote path to scan
 * @param {string} [options.host] - SSH host alias (default: storage)
 * @param {string[]} [options.exclude] - Additional patterns to exclude
 * @param {number} [options.max_depth] - Maximum directory depth
 * @returns {Object} { files: Array, folders: Array }
 */
export async function scan({
  path: scan_path,
  host = 'storage',
  exclude = [],
  max_depth
} = {}) {
  if (!scan_path) {
    throw new Error('--path is required for ssh source')
  }

  const exclude_set = new Set([...DEFAULT_EXCLUDES, ...exclude])
  const now = new Date().toISOString()

  // Build find command
  const find_args = build_find_command({
    scan_path,
    exclude_set,
    max_depth
  })

  console.log(`SSH ${host}: find ${scan_path} ...`)

  // Execute remote find
  const raw_output = await run_ssh_command(host, find_args)

  // Parse output into files and folders
  return parse_find_output({
    raw_output,
    host,
    scanned_at: now
  })
}

/**
 * Build the find command string for remote execution
 */
function build_find_command({ scan_path, exclude_set, max_depth }) {
  const parts = ['find', quote_shell(scan_path)]

  // Add exclusion patterns (prune directories)
  const excludes = Array.from(exclude_set)
  if (excludes.length > 0) {
    const prune_parts = excludes
      .map((e) => `-name ${quote_shell(e)}`)
      .join(' -o ')
    parts.push(`\\( ${prune_parts} \\) -prune -o`)
  }

  if (max_depth != null) {
    parts.push(`-maxdepth ${max_depth}`)
  }

  // Print type, size, mtime, and path for all non-pruned entries
  // %y = type (f/d/l), %s = size, %T@ = mtime epoch, %p = path
  parts.push(`-printf '%y\\t%s\\t%T@\\t%p\\n'`)

  return parts.join(' ')
}

/**
 * Run SSH command and collect output
 */
function run_ssh_command(host, command) {
  return new Promise((resolve, reject) => {
    const chunks = []
    const stderr_chunks = []

    const proc = spawn('ssh', [host, command], {
      stdio: ['ignore', 'pipe', 'pipe']
    })

    proc.stdout.on('data', (chunk) => {
      chunks.push(chunk)
    })

    proc.stderr.on('data', (chunk) => {
      stderr_chunks.push(chunk)
    })

    proc.on('close', (code) => {
      const output = Buffer.concat(chunks).toString('utf-8')
      const stderr = Buffer.concat(stderr_chunks).toString('utf-8')

      // find returns exit code 1 for permission errors but still outputs valid data
      if (code > 1) {
        reject(
          new Error(
            `SSH command failed (exit ${code}): ${stderr.slice(0, 500)}`
          )
        )
        return
      }

      if (stderr) {
        // Log permission errors but don't fail
        const perm_errors = stderr
          .split('\n')
          .filter((l) => l.includes('Permission denied'))
        if (perm_errors.length > 0) {
          console.log(
            `  (skipped ${perm_errors.length} permission-denied paths)`
          )
        }
      }

      resolve(output)
    })

    proc.on('error', (err) => {
      reject(new Error(`SSH connection failed: ${err.message}`))
    })
  })
}

/**
 * Parse find -printf output into files and folders arrays
 */
function parse_find_output({ raw_output, host, scanned_at }) {
  const files = []
  const folder_stats = new Map() // dir_path -> { file_count, subfolder_count, total_size, latest_mtime }
  const all_dirs = new Set()

  const lines = raw_output.split('\n')

  for (const line of lines) {
    if (!line) continue

    // Format: type\tsize\tmtime\tpath
    const tab1 = line.indexOf('\t')
    if (tab1 === -1) continue
    const tab2 = line.indexOf('\t', tab1 + 1)
    if (tab2 === -1) continue
    const tab3 = line.indexOf('\t', tab2 + 1)
    if (tab3 === -1) continue

    const type = line.slice(0, tab1)
    const size = parseInt(line.slice(tab1 + 1, tab2), 10)
    const mtime_epoch = parseFloat(line.slice(tab2 + 1, tab3))
    const file_path = line.slice(tab3 + 1)

    if (!file_path) continue

    const mtime = new Date(mtime_epoch * 1000)
    const name = path.basename(file_path)
    const dir = path.dirname(file_path)

    if (type === 'f') {
      const base_uri = `ssh://${host}${file_path}`
      const ext = path.extname(name).toLowerCase()

      files.push({
        base_uri,
        name,
        mime_type: MIME_TYPES[ext] || null,
        size: isNaN(size) ? null : size,
        modified_at: isNaN(mtime_epoch) ? null : mtime.toISOString(),
        source: 'ssh',
        cid: null,
        scanned_at
      })

      // Accumulate folder stats
      if (!folder_stats.has(dir)) {
        folder_stats.set(dir, {
          file_count: 0,
          subfolder_count: 0,
          total_size: 0,
          latest_mtime: null
        })
      }
      const stats = folder_stats.get(dir)
      stats.file_count++
      if (!isNaN(size)) stats.total_size += size
      if (
        !isNaN(mtime_epoch) &&
        (!stats.latest_mtime || mtime > stats.latest_mtime)
      ) {
        stats.latest_mtime = mtime
      }
    } else if (type === 'd') {
      all_dirs.add(file_path)

      // Track as subfolder of parent
      if (dir && dir !== file_path) {
        if (!folder_stats.has(dir)) {
          folder_stats.set(dir, {
            file_count: 0,
            subfolder_count: 0,
            total_size: 0,
            latest_mtime: null
          })
        }
        folder_stats.get(dir).subfolder_count++
      }
    }
  }

  // Propagate subtree stats bottom-up (O(n) instead of O(n^2))
  // Sort dirs by depth (deepest first) so children are processed before parents
  const sorted_dirs = Array.from(all_dirs).sort(
    (a, b) => b.split('/').length - a.split('/').length
  )

  // Initialize aggregated stats from direct stats
  const agg = new Map()
  for (const dir_path of sorted_dirs) {
    const stats = folder_stats.get(dir_path) || {
      file_count: 0,
      subfolder_count: 0,
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
    const parent = path.dirname(dir_path)
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
    const trailing = dir_path.endsWith('/') ? dir_path : dir_path + '/'

    folders.push({
      base_uri: `ssh://${host}${trailing}`,
      folder_name: path.basename(dir_path),
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

function quote_shell(str) {
  return `'${str.replace(/'/g, "'\\''")}'`
}
