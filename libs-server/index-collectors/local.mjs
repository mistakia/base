/**
 * Local Filesystem Collector
 *
 * Scans the local filesystem to index files and compute folder statistics.
 * Generates file:// base URIs.
 */

import fs from 'fs/promises'
import path from 'path'
import { get_mime_type } from './mime-types.mjs'

const DEFAULT_EXCLUDES = [
  '.git',
  '.DS_Store',
  'node_modules',
  '.Trash',
  '.Spotlight-V100',
  '.fseventsd',
  'Thumbs.db',
  '.cache',
  '__pycache__',
  '.venv',
  'venv',
  '.tox',
  '.mypy_cache',
  '.pytest_cache'
]

/**
 * Scan local filesystem path
 *
 * @param {Object} options
 * @param {string} options.path - Absolute path to scan
 * @param {string[]} [options.exclude] - Additional patterns to exclude
 * @param {number} [options.max_depth] - Maximum directory depth
 * @returns {Object} { files: Array, folders: Array }
 */
export async function scan({ path: scan_path, exclude = [], max_depth } = {}) {
  if (!scan_path) {
    throw new Error('--path is required for local source')
  }

  // Resolve to absolute path
  const abs_path = path.resolve(scan_path)

  // Verify path exists
  try {
    const stat = await fs.stat(abs_path)
    if (!stat.isDirectory()) {
      throw new Error(`Not a directory: ${abs_path}`)
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Path not found: ${abs_path}`)
    }
    throw error
  }

  const exclude_set = new Set([...DEFAULT_EXCLUDES, ...exclude])
  const now = new Date().toISOString()
  const files = []
  const folder_map = new Map() // base_uri -> folder stats

  await scan_directory({
    dir_path: abs_path,
    exclude_set,
    files,
    folder_map,
    max_depth,
    current_depth: 0,
    scanned_at: now
  })

  const folders = Array.from(folder_map.values())

  return { files, folders }
}

/**
 * Recursively scan a directory
 */
async function scan_directory({
  dir_path,
  exclude_set,
  files,
  folder_map,
  max_depth,
  current_depth,
  scanned_at
}) {
  let entries
  try {
    entries = await fs.readdir(dir_path, { withFileTypes: true })
  } catch (error) {
    // Permission denied or other read errors -- skip
    if (error.code === 'EACCES' || error.code === 'EPERM') {
      return {
        file_count: 0,
        subfolder_count: 0,
        total_size: 0,
        deepest_depth: 0,
        latest_mtime: null
      }
    }
    throw error
  }

  let file_count = 0
  let subfolder_count = 0
  let total_size = 0
  let deepest_depth = 0
  let latest_mtime = null

  for (const entry of entries) {
    if (exclude_set.has(entry.name)) continue

    const entry_path = path.join(dir_path, entry.name)

    if (entry.isSymbolicLink()) continue

    if (entry.isFile()) {
      try {
        const stat = await fs.stat(entry_path)
        const base_uri = `file://${entry_path}`
        const ext = path.extname(entry.name).toLowerCase()
        const mime_type = get_mime_type(ext)

        files.push({
          base_uri,
          name: entry.name,
          mime_type,
          size: stat.size,
          modified_at: stat.mtime.toISOString(),
          source: 'local',
          cid: null,
          scanned_at
        })

        file_count++
        total_size += stat.size
        if (!latest_mtime || stat.mtime > latest_mtime) {
          latest_mtime = stat.mtime
        }
      } catch {
        // Skip files we cannot stat
      }
    } else if (entry.isDirectory()) {
      subfolder_count++

      if (max_depth != null && current_depth >= max_depth) continue

      const child_stats = await scan_directory({
        dir_path: entry_path,
        exclude_set,
        files,
        folder_map,
        max_depth,
        current_depth: current_depth + 1,
        scanned_at
      })

      total_size += child_stats.total_size
      if (child_stats.deepest_depth + 1 > deepest_depth) {
        deepest_depth = child_stats.deepest_depth + 1
      }
      if (
        child_stats.latest_mtime &&
        (!latest_mtime || child_stats.latest_mtime > latest_mtime)
      ) {
        latest_mtime = child_stats.latest_mtime
      }
    }
  }

  // Record folder statistics
  const folder_uri = `file://${dir_path}/`
  folder_map.set(folder_uri, {
    base_uri: folder_uri,
    folder_name: path.basename(dir_path),
    file_count,
    subfolder_count,
    total_size,
    deepest_depth,
    modified_at: latest_mtime ? latest_mtime.toISOString() : null,
    scanned_at
  })

  return {
    file_count,
    subfolder_count,
    total_size,
    deepest_depth,
    latest_mtime
  }
}

