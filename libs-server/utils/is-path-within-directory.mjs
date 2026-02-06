import path from 'path'

/**
 * Check if a path is within or equal to a parent directory.
 * Uses path.sep to prevent name collision attacks (e.g., /base2 matching /base).
 *
 * @param {string} child_path - The path to check (must be absolute)
 * @param {string} parent_path - The parent directory boundary (must be absolute)
 * @returns {boolean} True if child_path is within or equal to parent_path
 */
export function is_path_within_directory(child_path, parent_path) {
  return (
    child_path === parent_path ||
    child_path.startsWith(parent_path + path.sep)
  )
}
