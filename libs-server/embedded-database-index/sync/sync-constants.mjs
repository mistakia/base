/**
 * Sync Constants
 *
 * Shared constants for the embedded database index sync system.
 */

import debug from 'debug'

const log = debug('embedded-index:sync:filter')

/**
 * Default path patterns to exclude from entity scanning.
 * Excludes git worktrees which contain duplicate entity files.
 */
export const DEFAULT_EXCLUDE_PATTERNS = ['**/*-worktrees/**']

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
 * Known submodule prefixes that contain non-entity markdown files.
 * Files in these paths are excluded from entity sync even if they match
 * entity directory patterns (e.g., text/epstein/transparency-act/ matches text/).
 */
export const SUBMODULE_EXCLUSION_PREFIXES = [
  'text/epstein/transparency-act/',
  'import-history/',
  'repository/active/',
  'repository/archive/'
]

/**
 * Filter file paths to only include entity files
 * @param {Object} params
 * @param {string[]} params.file_paths - All file paths
 * @param {string[]} params.entity_directories - Entity directories to include
 * @param {string[]} params.submodule_exclusions - Submodule prefixes to exclude
 * @returns {{filtered: string[], excluded_submodule: string[], excluded_non_entity: string[]}}
 */
export function filter_entity_files_detailed({
  file_paths,
  entity_directories = ENTITY_DIRECTORIES,
  submodule_exclusions = SUBMODULE_EXCLUSION_PREFIXES
}) {
  const filtered = []
  const excluded_submodule = []
  const excluded_non_entity = []

  for (const file_path of file_paths) {
    const is_in_entity_dir = entity_directories.some((dir) =>
      file_path.startsWith(`${dir}/`)
    )
    const is_markdown = file_path.endsWith('.md')
    const is_in_excluded_submodule = submodule_exclusions.some((prefix) =>
      file_path.startsWith(prefix)
    )

    if (is_in_entity_dir && is_markdown) {
      if (is_in_excluded_submodule) {
        excluded_submodule.push(file_path)
      } else {
        filtered.push(file_path)
      }
    } else if (is_markdown) {
      excluded_non_entity.push(file_path)
    }
  }

  return { filtered, excluded_submodule, excluded_non_entity }
}

/**
 * Filter file paths to only include entity files
 * @param {Object} params
 * @param {string[]} params.file_paths - All file paths
 * @param {string[]} params.entity_directories - Entity directories to include
 * @param {string[]} params.submodule_exclusions - Submodule prefixes to exclude
 * @returns {string[]} Filtered entity file paths
 */
export function filter_entity_files({
  file_paths,
  entity_directories = ENTITY_DIRECTORIES,
  submodule_exclusions = SUBMODULE_EXCLUSION_PREFIXES
}) {
  const { filtered, excluded_submodule } = filter_entity_files_detailed({
    file_paths,
    entity_directories,
    submodule_exclusions
  })

  // Log excluded files for visibility
  if (excluded_submodule.length > 0) {
    log(
      'Filtered out %d files from excluded submodules: %o',
      excluded_submodule.length,
      excluded_submodule.length <= 10
        ? excluded_submodule
        : [
            ...excluded_submodule.slice(0, 5),
            `... and ${excluded_submodule.length - 5} more`
          ]
    )
  }

  return filtered
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
