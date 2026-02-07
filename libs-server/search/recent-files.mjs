import { promises as fs } from 'fs'
import path from 'path'
import debug from 'debug'

import config from '#config'
import { get_search_config_section, DEFAULT_CONFIG } from './search-config.mjs'

const log = debug('search:recent-files')

/**
 * Recursively scan a directory for markdown files
 *
 * @param {string} directory_path - Directory to scan
 * @param {string[]} [exclude_directories=[]] - Directory names to exclude from scan
 * @returns {Promise<string[]>} Array of absolute file paths
 */
async function scan_directory_for_markdown(
  directory_path,
  exclude_directories = []
) {
  const file_paths = []

  try {
    const entries = await fs.readdir(directory_path, { withFileTypes: true })

    for (const entry of entries) {
      const full_path = path.join(directory_path, entry.name)

      if (entry.isDirectory()) {
        // Skip excluded directories by name
        if (exclude_directories.includes(entry.name)) {
          log(`Skipping excluded directory: ${full_path}`)
          continue
        }

        // Recursively scan subdirectories
        const nested_files = await scan_directory_for_markdown(
          full_path,
          exclude_directories
        )
        file_paths.push(...nested_files)
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        file_paths.push(full_path)
      }
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      log(`Directory not found: ${directory_path}`)
    } else {
      log(`Error scanning directory ${directory_path}: ${error.message}`)
    }
  }

  return file_paths
}

/**
 * Get file stats with modification time
 *
 * @param {string} file_path - Absolute path to file
 * @returns {Promise<{path: string, mtime: Date}|null>} File info or null if error
 */
async function get_file_mtime(file_path) {
  try {
    const stats = await fs.stat(file_path)
    return {
      path: file_path,
      mtime: stats.mtime
    }
  } catch (error) {
    log(`Error getting stats for ${file_path}: ${error.message}`)
    return null
  }
}

/**
 * Determine entity type from file path
 *
 * @param {string} relative_path - Relative path from user base directory (forward slashes)
 * @returns {string|null} Entity type or null
 */
function get_entity_type_from_path(relative_path) {
  const first_segment = relative_path.split('/')[0]
  const valid_types = ['task', 'workflow', 'guideline', 'text', 'tag']
  return valid_types.includes(first_segment) ? first_segment : null
}

/**
 * Get recently modified entity files from the user base directory
 *
 * @param {Object} params - Parameters
 * @param {number} [params.hours=48] - Time window in hours
 * @param {number} [params.limit=50] - Maximum number of files to return
 * @param {string[]} [params.directories] - Directories to scan
 * @param {string} [params.user_base_directory] - Optional override for user base directory (for testing)
 * @returns {Promise<Array<{relative_path: string, absolute_path: string, mtime: Date, entity_type: string|null}>>}
 */
export async function get_recent_entity_files({
  hours,
  limit,
  directories,
  user_base_directory
} = {}) {
  // Load configuration
  const recent_config = await get_search_config_section('recent_files')
  const merged_config = { ...DEFAULT_CONFIG.recent_files, ...recent_config }

  // Apply parameters with config defaults
  const effective_hours = hours ?? merged_config.hours
  const effective_limit = limit ?? merged_config.limit
  const effective_directories = directories ?? merged_config.directories
  const exclude_directories = merged_config.exclude_directories || []

  const user_base_dir =
    user_base_directory ||
    config.user_base_directory ||
    process.env.USER_BASE_DIRECTORY

  if (!user_base_dir) {
    log('USER_BASE_DIRECTORY not configured')
    return []
  }

  // Calculate cutoff time
  const cutoff_time = new Date(Date.now() - effective_hours * 60 * 60 * 1000)
  log(
    `Scanning for files modified after ${cutoff_time.toISOString()} in directories: ${effective_directories.join(', ')}`
  )
  if (exclude_directories.length > 0) {
    log(`Excluding directories: ${exclude_directories.join(', ')}`)
  }

  // Collect all markdown files from specified directories
  const all_file_paths = []
  for (const directory of effective_directories) {
    const directory_path = path.join(user_base_dir, directory)
    const files = await scan_directory_for_markdown(
      directory_path,
      exclude_directories
    )
    all_file_paths.push(...files)
  }

  log(`Found ${all_file_paths.length} markdown files`)

  // Get modification times for all files
  const file_stats_promises = all_file_paths.map(get_file_mtime)
  const file_stats_results = await Promise.all(file_stats_promises)
  const file_stats = file_stats_results.filter(Boolean)

  // Filter by modification time
  const recent_files = file_stats.filter((file) => file.mtime > cutoff_time)

  log(`${recent_files.length} files modified within ${effective_hours} hours`)

  // Sort by modification time (most recent first)
  recent_files.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())

  // Limit results and format output
  const limited_files = recent_files.slice(0, effective_limit)

  return limited_files.map((file) => {
    // Normalize to forward slashes for cross-platform consistency
    const relative_path = path
      .relative(user_base_dir, file.path)
      .split(path.sep)
      .join('/')
    return {
      relative_path,
      absolute_path: file.path,
      mtime: file.mtime,
      entity_type: get_entity_type_from_path(relative_path)
    }
  })
}

/**
 * Check if recent files feature is enabled
 *
 * @returns {Promise<boolean>} True if feature is enabled
 */
export async function is_recent_files_enabled() {
  const recent_config = await get_search_config_section('recent_files')
  const merged_config = { ...DEFAULT_CONFIG.recent_files, ...recent_config }
  return merged_config.enabled
}

/**
 * Get recent files configuration
 *
 * @returns {Promise<Object>} Recent files configuration
 */
export async function get_recent_files_config() {
  const recent_config = await get_search_config_section('recent_files')
  return { ...DEFAULT_CONFIG.recent_files, ...recent_config }
}
