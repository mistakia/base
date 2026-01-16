import path from 'path'
import debug from 'debug'

import config from '#config'

const log = debug('search:directory')

/**
 * Extract unique directory paths from a list of file paths
 *
 * This is much faster than traversing the filesystem since we already
 * have the file paths from ripgrep (which respects .gitignore and exclude patterns).
 *
 * @param {Array<Object>} file_results - File results with file_path property
 * @returns {Set<string>} Set of unique directory paths
 */
function extract_directories_from_files(file_results) {
  const directories = new Set()

  for (const file of file_results) {
    const file_path = file.file_path
    if (!file_path) continue

    // Extract all parent directories from the file path
    const parts = file_path.split('/')
    let current_path = ''

    // Skip the last part (filename)
    for (let i = 0; i < parts.length - 1; i++) {
      current_path = current_path ? `${current_path}/${parts[i]}` : parts[i]
      directories.add(current_path)
    }
  }

  return directories
}

/**
 * Search for directories by extracting them from file paths
 *
 * This approach derives directories from file paths returned by ripgrep,
 * which is much faster than filesystem traversal because:
 * 1. Ripgrep already respects .gitignore and exclude patterns
 * 2. We don't read into node_modules or other excluded directories
 * 3. We process paths we already have in memory
 *
 * @param {Object} params - Parameters
 * @param {Array<Object>} [params.file_results] - File results to extract directories from
 * @param {number} [params.limit=5000] - Maximum directories to return
 * @returns {Promise<Array<Object>>} Array of directory objects
 */
export async function search_directories({
  file_results = null,
  limit = 5000
} = {}) {
  const user_base_dir =
    config.user_base_directory || process.env.USER_BASE_DIRECTORY

  if (!user_base_dir) {
    throw new Error('USER_BASE_DIRECTORY not configured')
  }

  log(`Extracting directories from ${file_results?.length || 0} files`)

  // If no file results provided, we can't extract directories
  // The caller should provide file results from search_all_file_paths
  if (!file_results || file_results.length === 0) {
    log('No file results provided, returning empty directory list')
    return []
  }

  // Extract unique directories from file paths
  const directory_set = extract_directories_from_files(file_results)

  // Convert to array and format
  const directories = Array.from(directory_set)
    .slice(0, limit)
    .map((dir_path) => ({
      file_path: dir_path.endsWith('/') ? dir_path : dir_path + '/',
      absolute_path: path.join(user_base_dir, dir_path),
      type: 'directory'
    }))

  log(`Found ${directories.length} directories`)
  return directories
}
