import debug from 'debug'
import fs from 'fs/promises'
import path from 'path'

const log = debug('repository:filesystem:list-files-recursive')

/**
 * Tests if a file path matches the pattern
 *
 * @param {string} file_path - Path to check
 * @param {string} path_pattern - Pattern to match against (simple glob with just * wildcard)
 * @returns {boolean} - Whether the path matches the pattern
 */
function matches_pattern(file_path, path_pattern) {
  if (!path_pattern) return true

  // Convert glob pattern to regex
  // This handles simple glob patterns where * matches any sequence of characters
  const regex_pattern = path_pattern
    .replace(/\./g, '\\.') // Escape dots
    .replace(/\*/g, '.*') // Convert * to regex equivalent

  const regex = new RegExp(`^${regex_pattern}$`)
  return regex.test(file_path)
}

/**
 * List files recursively in a directory with optional pattern matching
 *
 * @param {Object} params - Parameters
 * @param {string} params.directory - Directory to search in
 * @param {string} [params.path_pattern] - Pattern to match against paths (simple glob with * wildcard)
 * @param {string} [params.file_extension] - Filter by file extension (e.g., '.md')
 * @param {boolean} [params.absolute_paths=true] - Return absolute paths if true, relative if false
 * @returns {Promise<string[]>} - List of file paths
 */
export async function list_files_recursive({
  directory,
  path_pattern,
  file_extension,
  absolute_paths = true
}) {
  // Validate required parameters
  if (!directory) {
    throw new Error('directory is required')
  }

  try {
    log(`Scanning directory ${directory} recursively`)
    const result = await scan_directory_recursively({
      directory,
      path_pattern,
      file_extension,
      absolute_paths,
      base_directory: directory
    })

    log(`Found ${result.length} files in ${directory}`)
    return result
  } catch (error) {
    log(`Error scanning directory ${directory}: ${error.message}`)
    throw error
  }
}

/**
 * Internal function to scan directory recursively
 *
 * @param {Object} params - Parameters
 * @param {string} params.directory - Current directory to scan
 * @param {string} params.base_directory - Original base directory (for relative path calculation)
 * @param {string} [params.path_pattern] - Pattern to match against
 * @param {string} [params.file_extension] - Filter by file extension
 * @param {boolean} params.absolute_paths - Return absolute paths if true, relative if false
 * @returns {Promise<string[]>} - List of file paths
 */
async function scan_directory_recursively({
  directory,
  base_directory,
  path_pattern,
  file_extension,
  absolute_paths
}) {
  const files = []

  try {
    // Read all entries in the directory
    const entries = await fs.readdir(directory, { withFileTypes: true })

    for (const entry of entries) {
      const entry_path = path.join(directory, entry.name)

      if (entry.isDirectory()) {
        // Recursively scan subdirectories
        const subdirectory_files = await scan_directory_recursively({
          directory: entry_path,
          base_directory,
          path_pattern,
          file_extension,
          absolute_paths
        })
        files.push(...subdirectory_files)
      } else if (entry.isFile()) {
        // Calculate relative path from base directory
        const relative_path = path.relative(base_directory, entry_path)

        // Apply file extension filter if specified
        if (file_extension && !entry.name.endsWith(file_extension)) {
          continue
        }

        // Apply pattern matching if specified
        if (path_pattern && !matches_pattern(relative_path, path_pattern)) {
          continue
        }

        // Add file to results using absolute or relative path as requested
        files.push(absolute_paths ? entry_path : relative_path)
      }
    }

    return files
  } catch (error) {
    log(`Error scanning directory ${directory}: ${error.message}`)
    return files
  }
}

export default list_files_recursive
