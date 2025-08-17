import debug from 'debug'
import fs from 'fs/promises'
import path from 'path'
import picomatch from 'picomatch'

const log = debug('repository:filesystem:list-files-recursive')

/**
 * Normalize path separators to POSIX style for consistent glob matching
 *
 * @param {string} input_path
 * @returns {string}
 */
function to_posix_path(input_path) {
  if (!input_path) return ''
  return input_path.split(path.sep).join('/')
}

/**
 * Extract the longest static (non-glob) path prefix from a pattern.
 *
 * @param {string} pattern
 * @returns {string} POSIX path
 */
function extract_static_prefix(pattern) {
  const posix_pattern = to_posix_path(pattern)
  const segments = posix_pattern.split('/')
  const static_segments = []
  for (const segment of segments) {
    if (
      segment.includes('*') ||
      segment.includes('?') ||
      /\[.*\]/.test(segment)
    ) {
      break
    }
    if (segment.length === 0) continue
    static_segments.push(segment)
  }
  return static_segments.join('/')
}

/**
 * Build a matcher function using picomatch for an array of patterns
 *
 * @param {string[]} patterns
 * @param {boolean} default_when_empty - value to return when patterns is empty
 * @returns {(test_path: string) => boolean}
 */
function build_matcher(patterns, default_when_empty = true) {
  if (!patterns || patterns.length === 0) {
    return () => default_when_empty
  }
  const matchers = patterns.map((p) => picomatch(p))
  return (test_path) => {
    const posix = to_posix_path(test_path)
    return matchers.some((m) => m(posix))
  }
}

/**
 * Tests if a file path should be included based on include and exclude patterns
 *
 * @param {string} file_path - Path to check
 * @param {Function} include_matcher - Matcher built from include patterns
 * @param {Function} exclude_matcher - Matcher built from exclude patterns
 * @returns {boolean} - Whether the file should be included
 */
function should_include_file(file_path, include_matcher, exclude_matcher) {
  const posix_path = to_posix_path(file_path)
  // Exclude takes precedence
  if (exclude_matcher && exclude_matcher(posix_path)) return false
  return include_matcher ? include_matcher(posix_path) : true
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
    const include_matcher = build_matcher(include_path_patterns, true)
    const exclude_matcher = build_matcher(exclude_path_patterns, false)

    // Determine if there are directory-scoping patterns to allow pruning
    const include_static_prefixes = include_path_patterns.map(
      extract_static_prefix
    )
    const include_has_directory_patterns = include_path_patterns.some((p) =>
      to_posix_path(p).includes('/')
    )

    const result = await scan_directory_recursively({
      directory,
      include_path_patterns,
      exclude_path_patterns,
      file_extension,
      absolute_paths,
      base_directory: directory,
      include_matcher,
      exclude_matcher,
      include_static_prefixes,
      include_has_directory_patterns
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
 * @param {(p: string) => boolean} [params.include_matcher]
 * @param {(p: string) => boolean} [params.exclude_matcher]
 * @param {string[]} [params.include_static_prefixes]
 * @param {boolean} [params.include_has_directory_patterns]
 * @returns {Promise<string[]>} - List of file paths
 */
async function scan_directory_recursively({
  directory,
  base_directory,
  include_path_patterns,
  exclude_path_patterns,
  file_extension,
  absolute_paths,
  include_matcher,
  exclude_matcher,
  include_static_prefixes = [],
  include_has_directory_patterns = false
}) {
  const files = []

  try {
    // Early pruning based on include directory patterns
    if (include_has_directory_patterns) {
      const relative_dir = to_posix_path(
        path.relative(base_directory, directory)
      )
      if (relative_dir !== '') {
        const keep_scanning = include_static_prefixes.some((prefix) => {
          if (!prefix) return true
          const normalized_prefix = to_posix_path(prefix)
          return (
            relative_dir === normalized_prefix ||
            relative_dir.startsWith(normalized_prefix + '/') ||
            normalized_prefix.startsWith(relative_dir + '/')
          )
        })
        if (!keep_scanning) {
          return files
        }
      }
    }

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
          absolute_paths,
          include_matcher,
          exclude_matcher,
          include_static_prefixes,
          include_has_directory_patterns
        })
        files.push(...subdirectory_files)
      } else if (entry.isFile()) {
        // Calculate relative path from base directory
        const relative_path = path.relative(base_directory, entry_path)

        // Apply file extension filter if specified
        if (file_extension && !entry.name.endsWith(file_extension)) {
          continue
        }

        // Apply pattern matching using picomatch matchers
        if (
          !should_include_file(relative_path, include_matcher, exclude_matcher)
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
