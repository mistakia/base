import fs from 'fs'
import path from 'path'
import debug from 'debug'

import config from '#config'

const log = debug('git:find-git-root')

/**
 * Find the git repository root for a given file path
 * Walks up directories checking for .git until found or bounds are reached
 * @param {Object} params - The parameters
 * @param {string} params.file_path - Absolute path to the file or directory
 * @param {string} [params.bounds_path] - Optional path to stop searching at (defaults to user_base_directory)
 * @returns {string|null} The repository root path, or null if not found
 */
export function find_git_root({ file_path, bounds_path }) {
  const effective_bounds = bounds_path || config.user_base_directory

  // Normalize paths for comparison
  const normalized_bounds = path.resolve(effective_bounds)
  let current_path = path.resolve(file_path)

  // If file_path is a file, start from its directory
  try {
    const stats = fs.statSync(current_path)
    if (!stats.isDirectory()) {
      current_path = path.dirname(current_path)
    }
  } catch {
    // Path doesn't exist, start from its parent directory
    current_path = path.dirname(current_path)
  }

  log(
    `Searching for git root from ${current_path} within bounds ${normalized_bounds}`
  )

  // Check if current path is within or equals the bounds
  while (current_path.startsWith(normalized_bounds)) {
    const git_path = path.join(current_path, '.git')

    try {
      const stats = fs.statSync(git_path)
      // .git can be a directory (regular repo) or file (worktree)
      if (stats.isDirectory() || stats.isFile()) {
        log(`Found git root at ${current_path}`)
        return current_path
      }
    } catch {
      // .git doesn't exist at this level, continue up
    }

    // Move up one directory
    const parent_path = path.dirname(current_path)

    // Reached filesystem root without finding .git
    if (parent_path === current_path) {
      log(`Reached filesystem root without finding git repository`)
      return null
    }

    current_path = parent_path
  }

  log(`Reached bounds without finding git repository`)
  return null
}
