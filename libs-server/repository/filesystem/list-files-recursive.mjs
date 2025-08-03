import debug from 'debug'
import fs from 'fs/promises'
import path from 'path'

const log = debug('repository:filesystem:list-files-recursive')

/**
 * Tests if a file path matches any of the patterns
 *
 * @param {string} file_path - Path to check
 * @param {string[]} patterns - Array of patterns to match against (simple glob with just * wildcard)
 * @returns {boolean} - Whether the path matches any of the patterns
 */
function matches_any_pattern(file_path, patterns) {
  if (!patterns || patterns.length === 0) return true

  return patterns.some((pattern) => {
    // Convert glob pattern to regex
    // Handle ** (double wildcard) and * (single wildcard) differently
    const regex_pattern = pattern
      .replace(/\./g, '\\.') // Escape dots
      .replace(/\*\*\//g, '§DOUBLESTARSLASH§') // Replace **/ as a unit first
      .replace(/\*/g, '[^/]*') // Convert single * to match anything except directory separators
      .replace(/§DOUBLESTARSLASH§/g, '(?:.*/)?') // Convert **/ to match optional directory path with slash

    const regex = new RegExp(`^${regex_pattern}$`)
    return regex.test(file_path)
  })
}

/**
 * Tests if a file path should be included based on include and exclude patterns
 *
 * @param {string} file_path - Path to check
 * @param {string[]} include_patterns - Patterns to include (if empty, all files are included)
 * @param {string[]} exclude_patterns - Patterns to exclude (take precedence over include)
 * @returns {boolean} - Whether the file should be included
 */
function should_include_file(file_path, include_patterns, exclude_patterns) {
  // First check exclude patterns - they take precedence
  if (exclude_patterns && exclude_patterns.length > 0) {
    if (matches_any_pattern(file_path, exclude_patterns)) {
      return false
    }
  }

  // Then check include patterns
  return matches_any_pattern(file_path, include_patterns)
}

/**
 * List files recursively in a directory with optional pattern matching
 *
 * @param {Object} params - Parameters
 * @param {string} params.directory - Directory to search in
 * @param {string[]} [params.include_path_patterns] - Array of patterns to include (simple glob with * wildcard)
 * @param {string[]} [params.exclude_path_patterns] - Array of patterns to exclude (simple glob with * wildcard)
 * @param {string} [params.file_extension] - Filter by file extension (e.g., '.md')
 * @param {boolean} [params.absolute_paths=true] - Return absolute paths if true, relative if false
 * @returns {Promise<string[]>} - List of file paths
 */
export async function list_files_recursive({
  directory,
  include_path_patterns = [],
  exclude_path_patterns = [],
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
      include_path_patterns,
      exclude_path_patterns,
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
 * @param {string[]} params.include_path_patterns - Patterns to include
 * @param {string[]} params.exclude_path_patterns - Patterns to exclude
 * @param {string} [params.file_extension] - Filter by file extension
 * @param {boolean} params.absolute_paths - Return absolute paths if true, relative if false
 * @returns {Promise<string[]>} - List of file paths
 */
async function scan_directory_recursively({
  directory,
  base_directory,
  include_path_patterns,
  exclude_path_patterns,
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
          include_path_patterns,
          exclude_path_patterns,
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

        // Apply pattern matching
        if (
          !should_include_file(
            relative_path,
            include_path_patterns,
            exclude_path_patterns
          )
        ) {
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
