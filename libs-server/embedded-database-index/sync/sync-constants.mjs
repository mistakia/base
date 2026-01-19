/**
 * Sync Constants
 *
 * Shared constants for the embedded database index sync system.
 */

/**
 * Entity directories to watch and sync.
 * These directories contain markdown entity files that are indexed.
 */
export const ENTITY_DIRECTORIES = [
  'task',
  'tag',
  'guideline',
  'text',
  'workflow',
  'physical-item',
  'physical-location'
]

/**
 * File pattern for entity files.
 * All entity types use markdown files.
 */
export const ENTITY_FILE_PATTERN = '**/*.md'

/**
 * Pattern for thread metadata files.
 * Thread metadata is stored as JSON in thread/<uuid>/metadata.json
 */
export const THREAD_METADATA_PATTERN = /^thread\/[0-9a-f-]+\/metadata\.json$/i

/**
 * Filter file paths to only include entity files
 * @param {Object} params
 * @param {string[]} params.file_paths - All file paths
 * @param {string[]} params.entity_directories - Entity directories to include
 * @returns {string[]} Filtered entity file paths
 */
export function filter_entity_files({
  file_paths,
  entity_directories = ENTITY_DIRECTORIES
}) {
  return file_paths.filter((file_path) => {
    // Check if file is in an entity directory
    const is_in_entity_dir = entity_directories.some((dir) =>
      file_path.startsWith(`${dir}/`)
    )

    // Check if it's a markdown file
    const is_markdown = file_path.endsWith('.md')

    return is_in_entity_dir && is_markdown
  })
}

/**
 * Filter file paths to only include thread metadata files
 * @param {Object} params
 * @param {string[]} params.file_paths - All file paths
 * @returns {string[]} Filtered thread metadata file paths
 */
export function filter_thread_metadata_files({ file_paths }) {
  return file_paths.filter((file_path) => {
    return THREAD_METADATA_PATTERN.test(file_path)
  })
}

/**
 * UUID regex pattern for thread IDs
 */
const UUID_PATTERN =
  /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i

/**
 * Extract thread_id from a thread metadata file path.
 * Works with both absolute paths (from file watcher) and relative paths (from git).
 *
 * @param {string} file_path - Path containing thread UUID (e.g., "thread/uuid/metadata.json"
 *   or "/abs/path/thread/uuid/metadata.json")
 * @returns {string|null} The thread UUID or null
 */
export function extract_thread_id_from_path(file_path) {
  // Extract any UUID from the path - works for both relative and absolute paths
  const match = file_path.match(UUID_PATTERN)
  return match ? match[1] : null
}
